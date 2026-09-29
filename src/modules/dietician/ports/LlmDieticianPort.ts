import type { LlmMessage, LlmToolCall, LlmToolDefinition } from '../../../shared/llm/types';
import type { ConversationDigest } from '../domain/ConversationDigest';
import type { DietitianPersona } from './CoachAccessPort';
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

  /**
   * Cheap tier. One tool-calling turn of the data-gathering loop. When
   * `forceToolChoice` is set the model is made to call exactly that tool this
   * turn (used to guarantee the card tool fires regardless of model/language).
   */
  runContextGathering(
    messages: LlmMessage[],
    tools: LlmToolDefinition[],
    forceToolChoice?: { toolName: string },
    persona?: DietitianPersona | null,
  ): Promise<DieticianTurnResult>;

  /**
   * Prime tier. Streams the final user-facing answer. `persona` (a dietitian's
   * AI assistant) swaps the generic coach system prompt for one that puts the
   * dietitian's rules first — never both, they contradict.
   */
  streamAdvice(messages: LlmMessage[], persona?: DietitianPersona | null): AsyncIterable<string>;

  /** Cheap tier. Streams a short reply for the smalltalk lane. */
  streamSmalltalk(messages: LlmMessage[], persona?: DietitianPersona | null): AsyncIterable<string>;

  /**
   * Prime tier, non-streaming, no tools. A dietitian trying their AI assistant
   * in the panel, with the same system prompt their clients get.
   */
  previewReply(messages: LlmMessage[], persona: DietitianPersona): Promise<string>;

  /** Cheap tier, structured output. Rebuilds the rolling digest. */
  summarizeConversation(input: SummarizeConversationInput): Promise<ConversationDigest>;
}
