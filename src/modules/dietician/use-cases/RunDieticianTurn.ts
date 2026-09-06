import { performance } from 'node:perf_hooks';
import { DomainError } from '../../../shared/errors/DomainError';
import { IntegrationError } from '../../../shared/errors/IntegrationError';
import { trimHistory } from '../../../shared/llm/conversation/trimHistory';
import type { LlmMessage } from '../../../shared/llm/types';
import { createModuleLogger } from '../../../shared/observability/logger';
import {
  recordDieticianTurn,
  type DieticianLane,
  type DieticianTurnTimings,
} from '../observability/dieticianTurnMetrics';
import { buildDieticianContextBlock } from '../domain/dieticianContext';
import type { DieticianConversation } from '../domain/DieticianConversation';
import { forcedCardToolForIntent, needsAssistedLane, type DieticianIntent } from '../domain/DieticianIntent';
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

/** What the gather loop hands back to the synthesis stage. */
interface GatherOutcome {
  messages: LlmMessage[];
  /** How many cheap-tier gather calls were actually made this turn. */
  gatherTurns: number;
}

const round = (ms: number | undefined): number | undefined =>
  ms === undefined ? undefined : Math.round(ms);

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
    const startedAt = performance.now();
    const timings: DieticianTurnTimings = {};
    let lane: DieticianLane = 'smalltalk';
    let intentLabel = 'unknown';
    let gatherTurns = 0;
    let outcome = 'ok';
    let firstChunkSeen = false;

    const noteFirstChunk = (): void => {
      if (!firstChunkSeen) {
        firstChunkSeen = true;
        timings.ttfbMs = performance.now() - startedAt;
      }
    };

    try {
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

      // classifyIntent needs none of the plan/snapshot data — run all three at once.
      const prepStartedAt = performance.now();
      const [intent, plan, snapshot] = await Promise.all([
        this.llm.classifyIntent({ message: input.content, recentMessages: priorMessages }),
        this.planContextPort.getPlanContext(input.userId).catch((err) => {
          logger.warn({ err }, 'plan context lookup failed; continuing without it');
          return null;
        }),
        this.dailySnapshotPort.getTodaySnapshot(input.userId, input.today).catch((err) => {
          logger.warn({ err }, 'daily snapshot lookup failed; continuing without it');
          return null;
        }),
      ]);
      timings.prepMs = performance.now() - prepStartedAt;
      intentLabel = intent;
      lane = needsAssistedLane(intent) ? 'assisted' : 'smalltalk';

      const contextBlock = buildDieticianContextBlock({ plan, snapshot, digest: conversation.digest });
      const baseMessages: LlmMessage[] = contextBlock
        ? [{ role: 'system', content: contextBlock }, ...history]
        : history;

      const sink: TextSink = { text: '' };

      let synthesisMessages: LlmMessage[];
      let streamFn: (messages: LlmMessage[]) => AsyncIterable<string>;

      if (lane === 'smalltalk') {
        synthesisMessages = [...baseMessages, { role: 'system', content: DIETICIAN_SMALLTALK_GUARD }];
        streamFn = (messages) => this.llm.streamSmalltalk(messages);
      } else {
        const gatherStartedAt = performance.now();
        const gatherIterator = this.gatherContext(input, baseMessages, intent);
        let gatherStep = await gatherIterator.next();
        while (!gatherStep.done) {
          noteFirstChunk();
          yield gatherStep.value;
          gatherStep = await gatherIterator.next();
        }
        timings.gatherMs = performance.now() - gatherStartedAt;
        gatherTurns = gatherStep.value.gatherTurns;
        synthesisMessages = [
          ...gatherStep.value.messages,
          { role: 'system', content: DIETICIAN_ADVICE_GUARD },
        ];
        streamFn = (messages) => this.llm.streamAdvice(messages);
      }

      const streamStartedAt = performance.now();
      for await (const chunk of this.streamAndPersist(input.conversationId, synthesisMessages, streamFn, sink)) {
        noteFirstChunk();
        yield chunk;
      }
      timings.streamMs = performance.now() - streamStartedAt;

      const newTurnCount = await this.conversationRepository.incrementTurnCount(input.conversationId);
      await this.refreshDigestIfDue(conversation, newTurnCount, history, sink.text);
    } catch (err) {
      outcome = err instanceof DomainError ? err.code : 'error';
      throw err;
    } finally {
      timings.totalMs = performance.now() - startedAt;
      logger.info(
        {
          event: 'dietician_turn_complete',
          lane,
          intent: intentLabel,
          gatherTurns,
          outcome,
          ttfbMs: round(timings.ttfbMs),
          prepMs: round(timings.prepMs),
          gatherMs: round(timings.gatherMs),
          streamMs: round(timings.streamMs),
          totalMs: round(timings.totalMs),
        },
        'dietician turn complete',
      );
      recordDieticianTurn({ lane, outcome, timings });
    }
  }

  /** Cheap-tier tool-calling loop. Returns the messages to hand to the prime model, plus call count. */
  private async *gatherContext(
    input: RunDieticianTurnInput,
    baseMessages: LlmMessage[],
    intent: DieticianIntent,
  ): AsyncGenerator<DieticianStreamChunk, GatherOutcome, undefined> {
    // propose_meal_log is armed only on log_help; rating/recipe cards (and plain tools) stay armed everywhere.
    const allowProposal = intent === 'log_help';
    const armedTools = this.tools.filter((tool) => tool.yieldsCard !== 'proposal' || allowProposal);
    const toolDefinitions = armedTools.map((tool) => tool.definition);

    // The cheap gather model is unreliable at choosing to call the card tool on
    // its own (worse still outside English). When the classified intent maps to
    // a card, force that tool on the first gather turn so the card always fires.
    const forcedCardTool = forcedCardToolForIntent(intent);
    const canForce = forcedCardTool !== null && armedTools.some((tool) => tool.definition.name === forcedCardTool);
    let cardForced = false;

    let workingMessages = baseMessages;

    for (let turn = 0; turn < this.maxGatherTurns; turn++) {
      const forceToolChoice = canForce && !cardForced ? { toolName: forcedCardTool! } : undefined;
      const result = await this.llm.runContextGathering(workingMessages, toolDefinitions, forceToolChoice);
      if (forceToolChoice) {
        cardForced = true;
      }

      if (!result.toolCalls || result.toolCalls.length === 0) {
        return { messages: workingMessages, gatherTurns: turn + 1 };
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
    return { messages: workingMessages, gatherTurns: this.maxGatherTurns };
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
