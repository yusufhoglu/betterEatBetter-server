import type { LlmMessage, LlmToolCall, LlmToolDefinition } from '../../../shared/llm/types';

export interface LlmTurnResult {
  content: string;
  toolCalls?: LlmToolCall[];
}

/**
 * Thin wrapper around shared/llm/LlmClient, scoped to what chatbot needs.
 * `sendTurn` drives the tool-calling loop; `streamFinalReply` is ONLY for the
 * last, tool-call-free turn. Never leaks a provider-specific type — messages
 * and tools stay in shared/llm/types.ts's canonical shape.
 */
export interface LlmChatPort {
  sendTurn(messages: LlmMessage[], tools?: LlmToolDefinition[]): Promise<LlmTurnResult>;
  streamFinalReply(messages: LlmMessage[]): AsyncIterable<string>;
}
