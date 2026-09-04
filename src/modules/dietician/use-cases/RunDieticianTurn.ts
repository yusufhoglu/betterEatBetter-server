import { IntegrationError } from '../../../shared/errors/IntegrationError';
import { trimHistory } from '../../../shared/llm/conversation/trimHistory';
import type { LlmMessage } from '../../../shared/llm/types';
import { createModuleLogger } from '../../../shared/observability/logger';
import { buildDieticianContextBlock } from '../domain/dieticianContext';
import type { DieticianConversation } from '../domain/DieticianConversation';
import { needsAssistedLane } from '../domain/DieticianIntent';
import type { DieticianMessage } from '../domain/DieticianMessage';
import { encodeRatingMessage, encodeRecipeMessage } from '../domain/cardMessageCodec';
import type { DieticianStreamChunk } from '../domain/DieticianStreamChunk';
import type { MealLogProposal } from '../domain/MealLogProposal';
import type { MealRating } from '../domain/MealRating';
import { summarizeProposalForLlm } from '../domain/mealProposalUtils';
import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import type { Recipe } from '../domain/Recipe';
import {
  DIETICIAN_ADVICE_GUARD,
  DIETICIAN_SMALLTALK_GUARD,
} from '../dieticianSystemPrompt';
import type { DailySnapshotPort } from '../ports/DailySnapshotPort';
import type { DieticianConversationRepositoryPort } from '../ports/DieticianConversationRepositoryPort';
import type { LlmDieticianPort } from '../ports/LlmDieticianPort';
import type { PlanContextPort } from '../ports/PlanContextPort';
import type { DieticianTool } from './tools/DieticianTool';

const logger = createModuleLogger('dietician');

export interface RunDieticianTurnInput {
  userId: string;
  conversationId: string;
  content: string;
  /** The user's local calendar day (midnight UTC of that date) for today's snapshot. */
  today: Date;
}

interface TextSink {
  text: string;
}

function toLlmMessage(message: DieticianMessage): LlmMessage {
  if (message.proposal) {
    return { role: 'assistant', content: summarizeProposalForLlm(message.proposal) };
  }
  if (message.rating) {
    return {
      role: 'assistant',
      content: `Rated "${message.rating.mealName}" ${message.rating.score}/10. Fix: ${message.rating.fixNote}`,
    };
  }
  if (message.recipe) {
    return {
      role: 'assistant',
      content: `Provided recipe "${message.recipe.title}" (${message.recipe.calories} kcal).`,
    };
  }
  return { role: message.role, content: message.content };
}

/**
 * The dietician turn pipeline (analog of chatbot's SendMessage), staged across
 * two model tiers:
 *
 *   classify (cheap) → [smalltalk: cheap stream]
 *                    ↘ [assisted: gather (cheap tool loop) → synthesize (prime stream)]
 *   → post-turn: refresh the rolling digest every N turns (cheap, guarded)
 */
export class RunDieticianTurn {
  constructor(
    private readonly llm: LlmDieticianPort,
    private readonly conversationRepository: DieticianConversationRepositoryPort,
    private readonly planContextPort: PlanContextPort,
    private readonly dailySnapshotPort: DailySnapshotPort,
    private readonly tools: DieticianTool[],
    private readonly maxGatherTurns: number,
    private readonly digestEveryNTurns: number,
    private readonly maxContextMessages: number,
  ) {}

  async *execute(input: RunDieticianTurnInput): AsyncIterable<DieticianStreamChunk> {
    const conversation = await this.conversationRepository.findOrCreate(input.userId, input.conversationId);
    const userMessage = await this.conversationRepository.appendMessage(
      input.conversationId,
      'user',
      input.content,
      'live',
    );

    const history = trimHistory(
      [...conversation.messages, userMessage].map(toLlmMessage),
      this.maxContextMessages,
    );
    const priorMessages = history.slice(0, -1).filter((message) => message.role !== 'system');

    const intent = await this.llm.classifyIntent({ message: input.content, recentMessages: priorMessages });

    const [plan, snapshot] = await Promise.all([
      this.planContextPort.getPlanContext(input.userId).catch((err) => {
        logger.warn({ err }, 'plan context lookup failed; continuing without it');
        return null;
      }),
      this.dailySnapshotPort.getTodaySnapshot(input.userId, input.today).catch((err) => {
        logger.warn({ err }, 'daily snapshot lookup failed; continuing without it');
        return null;
      }),
    ]);

    const contextBlock = buildDieticianContextBlock({ plan, snapshot, digest: conversation.digest });
    const baseMessages: LlmMessage[] = contextBlock
      ? [{ role: 'system', content: contextBlock }, ...history]
      : history;

    const sink: TextSink = { text: '' };

    if (!needsAssistedLane(intent)) {
      yield* this.streamAndPersist(
        input.conversationId,
        [...baseMessages, { role: 'system', content: DIETICIAN_SMALLTALK_GUARD }],
        (messages) => this.llm.streamSmalltalk(messages),
        sink,
      );
    } else {
      const gathered = yield* this.gatherContext(input, baseMessages, intent === 'log_help');
      yield* this.streamAndPersist(
        input.conversationId,
        [...gathered, { role: 'system', content: DIETICIAN_ADVICE_GUARD }],
        (messages) => this.llm.streamAdvice(messages),
        sink,
      );
    }

    const newTurnCount = await this.conversationRepository.incrementTurnCount(input.conversationId);
    await this.refreshDigestIfDue(conversation, newTurnCount, history, sink.text);
  }

  /** Cheap-tier tool-calling loop. Returns the message list to hand to the prime model. */
  private async *gatherContext(
    input: RunDieticianTurnInput,
    baseMessages: LlmMessage[],
    allowProposal: boolean,
  ): AsyncGenerator<DieticianStreamChunk, LlmMessage[], undefined> {
    // propose_meal_log is armed only on log_help; rating/recipe cards (and plain tools) stay armed everywhere.
    const armedTools = this.tools.filter((tool) => tool.yieldsCard !== 'proposal' || allowProposal);
    const toolDefinitions = armedTools.map((tool) => tool.definition);

    let workingMessages = baseMessages;

    for (let turn = 0; turn < this.maxGatherTurns; turn++) {
      const result = await this.llm.runContextGathering(workingMessages, toolDefinitions);

      if (!result.toolCalls || result.toolCalls.length === 0) {
        return workingMessages;
      }

      workingMessages = [
        ...workingMessages,
        { role: 'assistant', content: result.content, toolCalls: result.toolCalls },
      ];

      for (const toolCall of result.toolCalls) {
        const tool = armedTools.find((candidate) => candidate.definition.name === toolCall.name);
        const output = tool
          ? await tool.execute(input.userId, toolCall.input, {
              conversationId: input.conversationId,
              messages: workingMessages,
            })
          : { error: `Unknown tool: ${toolCall.name}` };

        if (tool?.yieldsCard) {
          const encoded =
            tool.yieldsCard === 'proposal'
              ? encodeProposalMessage(output as MealLogProposal)
              : tool.yieldsCard === 'rating'
                ? encodeRatingMessage(output as MealRating)
                : encodeRecipeMessage(output as Recipe);
          await this.conversationRepository.appendMessage(input.conversationId, 'assistant', encoded, 'live');
          yield { type: tool.yieldsCard, [tool.yieldsCard]: output } as DieticianStreamChunk;
        }

        workingMessages = [
          ...workingMessages,
          { role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(output) },
        ];
      }
    }

    logger.warn(
      { conversationId: input.conversationId, maxGatherTurns: this.maxGatherTurns },
      'max gather turns reached, forcing synthesis',
    );
    return workingMessages;
  }

  private async *streamAndPersist(
    conversationId: string,
    messages: LlmMessage[],
    streamFn: (messages: LlmMessage[]) => AsyncIterable<string>,
    sink: TextSink,
  ): AsyncIterable<DieticianStreamChunk> {
    try {
      for await (const chunk of streamFn(messages)) {
        sink.text += chunk;
        yield { type: 'text', delta: chunk };
      }
    } catch (err) {
      logger.warn({ conversationId, err }, 'stream interrupted before completion, not persisting partial reply');
      throw new IntegrationError('STREAM_INTERRUPTED', 'The response stream was interrupted before completion', false);
    }

    await this.conversationRepository.appendMessage(conversationId, 'assistant', sink.text, 'live');
  }

  /** A digest failure is logged and swallowed — it must never fail the user's turn. */
  private async refreshDigestIfDue(
    conversation: DieticianConversation,
    newTurnCount: number,
    history: LlmMessage[],
    assistantReply: string,
  ): Promise<void> {
    if (newTurnCount - conversation.digestTurn < this.digestEveryNTurns) {
      return;
    }

    try {
      const recentMessages = trimHistory(
        [...history, { role: 'assistant' as const, content: assistantReply }].filter(
          (message) => message.role !== 'system',
        ),
        this.maxContextMessages,
      );
      const digest = await this.llm.summarizeConversation({
        priorDigest: conversation.digest,
        recentMessages,
      });
      await this.conversationRepository.saveDigest(conversation.id, digest, newTurnCount);
    } catch (err) {
      logger.warn({ conversationId: conversation.id, err }, 'digest refresh failed; keeping the previous digest');
    }
  }
}
