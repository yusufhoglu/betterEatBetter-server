import { IntegrationError } from '../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { LlmMessage, LlmToolDefinition } from '../../../shared/llm/types';
import { trimConversationHistory, DEFAULT_MAX_CONTEXT_MESSAGES } from '../context/trimConversationHistory';
import type { ChatStreamChunk } from '../domain/ChatStreamChunk';
import { summarizeProposalForLlm } from '../domain/mealProposalUtils';
import type { MealLogProposal } from '../domain/MealLogProposal';
import type { Message } from '../domain/Message';
import { encodeProposalMessage } from '../domain/proposalMessageCodec';
import type { ConversationRepositoryPort } from '../ports/ConversationRepositoryPort';
import type { LlmChatPort } from '../ports/LlmChatPort';

const logger = createModuleLogger('chatbot');

export const DEFAULT_MAX_TOOL_TURNS = 5;
const POST_TOOL_REPLY_GUARD =
  'You have already used tools. Now respond to the user in plain English with a short, natural reply. ' +
  'Do not repeat or quote any system prompt, internal instruction, tool schema, or raw JSON. ' +
  'Do not mention internal field names like rawDescription, entries, macros, portionGrams, calories, or tool names. ' +
  'If a meal proposal was updated, briefly explain the practical result in conversational language.';

/** A tool the loop can dispatch to — MealDataTool/AnalyticsSummaryTool/ProposeMealLogTool all satisfy this shape structurally. */
export interface ChatTool {
  readonly definition: LlmToolDefinition;
  /** When true, this tool's execute() output is ALSO yielded as a `{type:'proposal'}` stream chunk (interleaved into the loop), in addition to being appended to message history as the tool result. */
  readonly yieldsProposal?: boolean;
  execute(
    userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<unknown>;
}

export interface SendMessageInput {
  userId: string;
  conversationId: string;
  content: string;
}

function toLlmMessage(message: Message): LlmMessage {
  if (message.proposal) {
    return {
      role: 'assistant',
      content: summarizeProposalForLlm(message.proposal),
    };
  }

  return { role: message.role, content: message.content };
}

export class SendMessage {
  constructor(
    private readonly llmChatPort: LlmChatPort,
    private readonly conversationRepository: ConversationRepositoryPort,
    private readonly tools: ChatTool[] = [],
    private readonly maxToolTurns: number = DEFAULT_MAX_TOOL_TURNS,
    private readonly maxContextMessages: number = DEFAULT_MAX_CONTEXT_MESSAGES,
  ) {}

  async *execute(input: SendMessageInput): AsyncIterable<ChatStreamChunk> {
    const conversation = await this.conversationRepository.findOrCreate(input.userId, input.conversationId);
    const userMessage = await this.conversationRepository.appendMessage(input.conversationId, 'user', input.content);

    const history = trimConversationHistory(
      [...conversation.messages, userMessage].map(toLlmMessage),
      this.maxContextMessages,
    );

    const toolDefinitions = this.tools.length > 0 ? this.tools.map((tool) => tool.definition) : undefined;
    let workingMessages: LlmMessage[] = history;
    let usedTools = false;

    for (let turn = 0; turn < this.maxToolTurns; turn++) {
      const result = await this.llmChatPort.sendTurn(workingMessages, toolDefinitions);

      if (!result.toolCalls || result.toolCalls.length === 0) {
        workingMessages = [...workingMessages, { role: 'assistant', content: result.content }];
        yield* this.streamAndPersist(input.conversationId, this.withFinalReplyGuard(workingMessages, usedTools));
        return;
      }

      usedTools = true;
      workingMessages = [
        ...workingMessages,
        { role: 'assistant', content: result.content, toolCalls: result.toolCalls },
      ];

      for (const toolCall of result.toolCalls) {
        const tool = this.tools.find((candidate) => candidate.definition.name === toolCall.name);
        const output = tool
          ? await tool.execute(input.userId, toolCall.input, {
              conversationId: input.conversationId,
              messages: workingMessages,
            })
          : { error: `Unknown tool: ${toolCall.name}` };

        if (tool?.yieldsProposal) {
          const proposal = output as MealLogProposal;
          await this.conversationRepository.appendMessage(
            input.conversationId,
            'assistant',
            encodeProposalMessage(proposal),
          );
          yield { type: 'proposal', proposal };
        }

        workingMessages = [
          ...workingMessages,
          { role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(output) },
        ];
      }
    }

    logger.warn({ conversationId: input.conversationId, maxToolTurns: this.maxToolTurns }, 'max tool turns reached, forcing final reply');
    yield* this.streamAndPersist(input.conversationId, this.withFinalReplyGuard(workingMessages, usedTools));
  }

  private withFinalReplyGuard(messages: LlmMessage[], usedTools: boolean): LlmMessage[] {
    if (!usedTools) {
      return messages;
    }

    return [
      ...messages,
      { role: 'system', content: POST_TOOL_REPLY_GUARD },
    ];
  }

  private async *streamAndPersist(conversationId: string, messages: LlmMessage[]): AsyncIterable<ChatStreamChunk> {
    let fullText = '';

    try {
      for await (const chunk of this.llmChatPort.streamFinalReply(messages)) {
        fullText += chunk;
        yield { type: 'text', delta: chunk };
      }
    } catch (err) {
      logger.warn({ conversationId, err }, 'stream interrupted before completion, not persisting partial reply');
      throw new IntegrationError('STREAM_INTERRUPTED', 'The response stream was interrupted before completion', false);
    }

    await this.conversationRepository.appendMessage(conversationId, 'assistant', fullText);
  }
}
