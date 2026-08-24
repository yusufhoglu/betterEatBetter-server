import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from './types';

/**
 * Provider-agnostic LLM client. `complete()` is for tool-calling turns and
 * one-shot/structured requests; `streamComplete()` is ONLY for the final,
 * tool-call-free text turn (a chatbot loop drives tool-calling turns through
 * `complete()` and switches to `streamComplete()` once no tool calls remain).
 */
export interface LlmClient {
  complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse>;
  streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string>;
}
