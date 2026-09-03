import type { LlmMessage, LlmToolCall, LlmToolDefinition } from '../../../shared/llm/types';
import type { ConversationDigest } from '../domain/ConversationDigest';
import type { DieticianIntent } from '../domain/DieticianIntent';

export interface DieticianTurnResult {
  content: string;
  toolCalls?: LlmToolCall[];
}

export interface SummarizeConversationInput {
  priorDigest: ConversationDigest | null;
  recentMessages: LlmMessage[];
}

/**
 * The tiered LLM seam for the dietician. The adapter decides which model tier
 * backs each method — `classifyIntent` / `runContextGathering` /
 * `summarizeConversation` use the cheap tier, `streamAdvice` the prime tier —
 * and tags each call with its own `dietician:*` feature so cost is attributable.
 * Never leaks a provider-specific type.
 */
export interface LlmDieticianPort {
  /** Cheap tier, structured output. Routes the turn. */
  classifyIntent(input: { message: string; recentMessages: LlmMessage[] }): Promise<DieticianIntent>;

  /** Cheap tier. One tool-calling turn of the data-gathering loop. */
  runContextGathering(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<DieticianTurnResult>;

  /** Prime tier. Streams the final user-facing answer. */
  streamAdvice(messages: LlmMessage[]): AsyncIterable<string>;

  /** Cheap tier. Streams a short reply for the smalltalk lane. */
  streamSmalltalk(messages: LlmMessage[]): AsyncIterable<string>;

  /** Cheap tier, structured output. Rebuilds the rolling digest. */
  summarizeConversation(input: SummarizeConversationInput): Promise<ConversationDigest>;
}
