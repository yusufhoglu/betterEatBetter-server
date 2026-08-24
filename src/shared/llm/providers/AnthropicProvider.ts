import Anthropic from '@anthropic-ai/sdk';
import { IntegrationError } from '../../errors/IntegrationError';
import { llmTokensTotal } from '../../observability/metrics';
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

type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;
type ToolUnion = Anthropic.ToolUnion;
type ToolChoice = Anthropic.ToolChoice;
type ContentBlock = Anthropic.ContentBlock;

const DEFAULT_FEATURE = 'unknown';
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model: string;
}

/** Translates the canonical LLM format to/from the Anthropic Messages API. */
export class AnthropicProvider implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
      tools: request.tools?.map(toAnthropicTool),
      tool_choice: toAnthropicToolChoice(request),
    });

    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    recordUsage(request.feature, usage);

    return {
      message: fromAnthropicContent(response.content),
      stopReason: fromAnthropicStopReason(response.stop_reason),
      usage,
    };
  }

  async *streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: request.temperature,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }

    const finalMessage = await stream.finalMessage();
    recordUsage(request.feature, {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    });
  }
}

function recordUsage(feature: string | undefined, usage: LlmUsage): void {
  const featureLabel = feature ?? DEFAULT_FEATURE;
  llmTokensTotal.inc({ provider: 'anthropic', feature: featureLabel, type: 'input' }, usage.inputTokens);
  llmTokensTotal.inc({ provider: 'anthropic', feature: featureLabel, type: 'output' }, usage.outputTokens);
}

/**
 * Anthropic has no 'tool' message role — tool results are `tool_result`
 * content blocks inside a `user` turn, and consecutive canonical `tool`
 * messages (parallel tool calls) must be merged into ONE user turn.
 */
function toAnthropicMessages(messages: LlmMessage[]): MessageParam[] {
  const result: MessageParam[] = [];
  let pendingToolResults: ToolResultBlockParam[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      result.push({ role: 'user', content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const message of messages) {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new IntegrationError('LLM_MALFORMED_MESSAGE', "role: 'tool' message missing toolCallId", false);
      }
      pendingToolResults.push({ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content });
      continue;
    }

    flushToolResults();

    if (message.role === 'system') {
      throw new IntegrationError(
        'LLM_UNSUPPORTED_MESSAGE',
        "role: 'system' belongs in request.system for Anthropic, not messages[]",
        false,
      );
    }

    if (message.role === 'user') {
      result.push({ role: 'user', content: message.content });
      continue;
    }

    // assistant
    const blocks: ContentBlockParam[] = [];
    if (message.content.length > 0) {
      blocks.push({ type: 'text', text: message.content });
    }
    for (const call of message.toolCalls ?? []) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    }
    result.push({ role: 'assistant', content: blocks });
  }

  flushToolResults();
  return result;
}

function toAnthropicTool(tool: LlmToolDefinition): ToolUnion {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicToolChoice(request: LlmCompleteRequest): ToolChoice | undefined {
  if (request.forceToolChoice) {
    return { type: 'tool', name: request.forceToolChoice.toolName };
  }
  return request.tools && request.tools.length > 0 ? { type: 'auto' } : undefined;
}

function fromAnthropicContent(content: ContentBlock[]): LlmMessage {
  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      text += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
    }
  }
  return {
    role: 'assistant',
    content: text,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

function fromAnthropicStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      throw new IntegrationError('LLM_UNHANDLED_STOP_REASON', `Unhandled Anthropic stop_reason: ${String(reason)}`, false);
  }
}
