import OpenAI from 'openai';
import { IntegrationError } from '../../errors/IntegrationError';
import { llmTokensTotal } from '../../observability/metrics';
import { createModuleLogger } from '../../observability/logger';
import type { LlmClient } from '../LlmClient';
import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmMessage,
  LlmStopReason,
  LlmStreamCompleteRequest,
  LlmToolCall,
  LlmToolDefinition,
  LlmUsage,
} from '../types';

type ChatCompletionMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatCompletionToolChoiceOption = OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessage;

const DEFAULT_FEATURE = 'unknown';
const logger = createModuleLogger('llm');

export interface OpenAiProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  /**
   * SDK-level retry budget. The OpenAI SDK retries 429/408/409/5xx and
   * connection errors with exponential backoff, honouring `Retry-After` /
   * `retry-after-ms` response headers — this is the primary throttle defence.
   */
  readonly maxRetries?: number;
}

/** Translates the canonical LLM format to/from the OpenAI Chat Completions API. */
export class OpenAiProvider implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    });
    this.model = options.model;
  }

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: request.model ?? this.model,
        messages: toOpenAiMessages(request),
        tools: request.tools?.map(toOpenAiTool),
        tool_choice: toOpenAiToolChoice(request),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      });
    } catch (err) {
      throw mapOpenAiError(err);
    }

    const choice = response.choices[0];
    if (!choice) {
      throw new IntegrationError('LLM_EMPTY_RESPONSE', 'OpenAI returned no choices', true);
    }

    const usage: LlmUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
    recordUsage(request.feature, request.model ?? this.model, usage);

    return {
      message: fromOpenAiMessage(choice.message),
      stopReason: fromOpenAiFinishReason(choice.finish_reason),
      usage,
    };
  }

  async *streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string> {
    let stream;
    try {
      stream = await this.client.chat.completions.create({
        model: request.model ?? this.model,
        messages: toOpenAiMessages(request),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });
    } catch (err) {
      throw mapOpenAiError(err);
    }

    let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
      }
    }
    recordUsage(request.feature, request.model ?? this.model, usage);
  }
}

function mapOpenAiError(err: unknown): Error {
  if (err instanceof IntegrationError) {
    return err;
  }

  // The SDK has already exhausted its own retry budget by the time it throws.
  const status = readHttpStatus(err);
  if (status === 429) {
    // Not retryable at this layer: the SDK already retried honouring
    // Retry-After, and a tight app-level retry won't outlast the window —
    // the client should back off using the Retry-After header instead.
    return new IntegrationError(
      'LLM_RATE_LIMITED',
      'OpenAI rate limit exceeded',
      false,
      503,
      readRetryAfterSeconds(err),
    );
  }
  if (status !== undefined && status >= 500) {
    return new IntegrationError('LLM_UPSTREAM_UNAVAILABLE', `OpenAI returned HTTP ${status}`, true, 503);
  }

  if (isOpenAiConnectionTimeoutError(err)) {
    return new IntegrationError('LLM_NETWORK_TIMEOUT', 'OpenAI connection timed out', true, 503);
  }

  if (isOpenAiConnectionError(err)) {
    return new IntegrationError('LLM_NETWORK_ERROR', 'Could not reach OpenAI', true, 503);
  }

  return err instanceof Error ? err : new Error(String(err));
}

/** OpenAI's `APIError` carries a numeric `status`; duck-typed so a mocked SDK still works. */
function readHttpStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return status;
    }
  }
  return undefined;
}

function readRetryAfterSeconds(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown }).headers;

  const readHeader = (name: string): string | null => {
    if (headers && typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    if (headers && typeof headers === 'object' && name in headers) {
      return String((headers as Record<string, unknown>)[name]);
    }
    return null;
  };

  const retryAfterMs = Number(readHeader('retry-after-ms'));
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.ceil(retryAfterMs / 1000);
  }

  const retryAfterSeconds = Number(readHeader('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds);
  }

  return undefined;
}

function isOpenAiConnectionTimeoutError(err: unknown): boolean {
  return hasErrorName(err, 'APIConnectionTimeoutError') || hasErrorMessage(err, 'connect timeout error');
}

function isOpenAiConnectionError(err: unknown): boolean {
  return hasErrorName(err, 'APIConnectionError') || hasErrorMessage(err, 'fetch failed');
}

function hasErrorName(err: unknown, expectedName: string): boolean {
  for (const current of iterateErrorChain(err)) {
    if (typeof current === 'object' && current !== null && 'name' in current && current.name === expectedName) {
      return true;
    }
  }
  return false;
}

function hasErrorMessage(err: unknown, expectedFragment: string): boolean {
  const normalizedFragment = expectedFragment.toLowerCase();
  for (const current of iterateErrorChain(err)) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'message' in current &&
      typeof current.message === 'string' &&
      current.message.toLowerCase().includes(normalizedFragment)
    ) {
      return true;
    }
  }
  return false;
}

function* iterateErrorChain(err: unknown): Iterable<unknown> {
  let current = err;
  const visited = new Set<unknown>();

  while (current && !visited.has(current)) {
    visited.add(current);
    yield current;

    if (typeof current === 'object' && current !== null && 'cause' in current) {
      current = current.cause;
      continue;
    }

    break;
  }
}

/**
 * Bumps the aggregate `llm_tokens_total` counter AND logs the per-call usage.
 * The counter answers "how many tokens does feature X burn over time"; the log
 * line is what makes a SINGLE conversation's cost answerable — every log line
 * automatically carries `traceId` (== conversationId for chatbot/dietician) via
 * the tracer's pino mixin, so it's queryable in Grafana/Loki as
 * `{service="node-backend"} |= "llm usage" | traceId="<conversationId>"`.
 */
function recordUsage(feature: string | undefined, model: string, usage: LlmUsage): void {
  const featureLabel = feature ?? DEFAULT_FEATURE;
  llmTokensTotal.inc({ provider: 'openai', feature: featureLabel, type: 'input' }, usage.inputTokens);
  llmTokensTotal.inc({ provider: 'openai', feature: featureLabel, type: 'output' }, usage.outputTokens);
  logger.info(
    { provider: 'openai', feature: featureLabel, model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    'llm usage',
  );
}

function toOpenAiMessages(request: { messages: LlmMessage[]; system?: string }): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  if (request.system) {
    result.push({ role: 'system', content: request.system });
  }
  for (const message of request.messages) {
    result.push(toOpenAiMessage(message));
  }
  return result;
}

function toOpenAiMessage(message: LlmMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: message.content };
    case 'user':
      return { role: 'user', content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content.length > 0 ? message.content : null,
        ...(message.toolCalls && message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: JSON.stringify(call.input) },
              })),
            }
          : {}),
      };
    case 'tool': {
      if (!message.toolCallId) {
        throw new IntegrationError('LLM_MALFORMED_MESSAGE', "role: 'tool' message missing toolCallId", false);
      }
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    }
  }
}

function toOpenAiTool(tool: LlmToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  };
}

function toOpenAiToolChoice(request: LlmCompleteRequest): ChatCompletionToolChoiceOption | undefined {
  if (request.forceToolChoice) {
    return { type: 'function', function: { name: request.forceToolChoice.toolName } };
  }
  return request.tools && request.tools.length > 0 ? 'auto' : undefined;
}

function fromOpenAiMessage(message: ChatCompletionMessage): LlmMessage {
  const toolCalls: LlmToolCall[] = (message.tool_calls ?? [])
    .filter((call): call is Extract<typeof call, { type: 'function' }> => call.type === 'function')
    .map((call) => ({
      id: call.id,
      name: call.function.name,
      input: parseToolArguments(call.function.arguments),
    }));

  return {
    role: 'assistant',
    content: message.content ?? '',
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new IntegrationError('LLM_INVALID_TOOL_ARGUMENTS', 'OpenAI returned non-JSON tool call arguments', false);
  }
}

function fromOpenAiFinishReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      throw new IntegrationError('LLM_UNHANDLED_STOP_REASON', `Unhandled OpenAI finish_reason: ${String(reason)}`, false);
  }
}
