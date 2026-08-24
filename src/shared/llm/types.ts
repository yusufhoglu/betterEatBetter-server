/**
 * Canonical, provider-agnostic message/tool shapes. No provider-specific type
 * (OpenAI's `ChatCompletionMessageParam`, Anthropic's `MessageParam`, ...) is
 * ever exposed outside `shared/llm/providers/` — every adapter translates to
 * and from this format at its boundary.
 */

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface LlmMessage {
  readonly role: LlmRole;
  readonly content: string;
  /** Set only on role: 'tool' — the id of the tool_use this result answers. */
  readonly toolCallId?: string;
  /** Set only on role: 'assistant', when the model called one or more tools. */
  readonly toolCalls?: LlmToolCall[];
}

export interface LlmToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON schema for the tool's input object. */
  readonly inputSchema: Record<string, unknown>;
}

/** Forces the model to call exactly this tool — the structured-output trick. */
export interface LlmForceToolChoice {
  readonly toolName: string;
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens';

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmCompleteRequest {
  readonly messages: LlmMessage[];
  readonly system?: string;
  readonly tools?: LlmToolDefinition[];
  readonly forceToolChoice?: LlmForceToolChoice;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Tags token usage for `llm_tokens_total` (shared/observability/metrics.ts). */
  readonly feature?: string;
}

export interface LlmCompleteResponse {
  readonly message: LlmMessage;
  readonly stopReason: LlmStopReason;
  readonly usage: LlmUsage;
}

export interface LlmStreamCompleteRequest {
  readonly messages: LlmMessage[];
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly feature?: string;
}
