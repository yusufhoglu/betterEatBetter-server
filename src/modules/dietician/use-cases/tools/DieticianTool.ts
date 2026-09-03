import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';

/**
 * A tool the data-gathering loop can dispatch to. Structurally identical to
 * chatbot's `ChatTool` — kept local because a module never imports another
 * module's use-cases layer for its own contracts (dietician-rule.md).
 */
export interface DieticianTool {
  readonly definition: LlmToolDefinition;
  /** When true, execute()'s output is also yielded as a `{type:'proposal'}` stream chunk. */
  readonly yieldsProposal?: boolean;
  execute(
    userId: string,
    input: Record<string, unknown>,
    context: { conversationId: string; messages: LlmMessage[] },
  ): Promise<unknown>;
}
