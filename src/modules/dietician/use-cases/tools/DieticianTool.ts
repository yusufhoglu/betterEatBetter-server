import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';

/**
 * A tool the data-gathering loop can dispatch to. Structurally identical to
 * chatbot's `ChatTool` — kept local because a module never imports another
 * module's use-cases layer for its own contracts (dietician-rule.md).
 */
export interface DieticianTool {
  readonly definition: LlmToolDefinition;
  /** When set, execute()'s output is also yielded as this stream-chunk type + persisted as a card message. */
  readonly yieldsCard?: 'proposal' | 'rating' | 'recipe';
  execute(
    userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<unknown>;
}
