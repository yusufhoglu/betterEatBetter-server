import type { LlmClient } from '../../../../shared/llm/LlmClient';
import { resolveModel } from '../../../../shared/llm/modelTiers';
import { requestStructuredOutput } from '../../../../shared/llm/structuredOutput';
import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import { conversationDigestSchema, type ConversationDigest } from '../../domain/ConversationDigest';
import { dieticianIntentSchema, type DieticianIntent } from '../../domain/DieticianIntent';
import {
  DIETICIAN_CLASSIFY_SYSTEM_PROMPT,
  DIETICIAN_DIGEST_SYSTEM_PROMPT,
  DIETICIAN_GATHER_SYSTEM_PROMPT,
  DIETICIAN_PERSONA,
} from '../../dieticianSystemPrompt';
import type {
  DieticianTurnResult,
  LlmDieticianPort,
  SummarizeConversationInput,
} from '../../ports/LlmDieticianPort';

/**
 * The only file in this module allowed to touch `shared/llm/`. Picks the model
 * tier per method — cheap for classify/gather/digest, prime for advice — and
 * tags every call with a distinct `dietician:*` feature so `llm_tokens_total`
 * separates the cost of each stage.
 */
export class TieredLlmDieticianAdapter implements LlmDieticianPort {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly cheapModel: string = resolveModel('cheap'),
    private readonly primeModel: string = resolveModel('prime'),
  ) {}

  async classifyIntent(input: { message: string; recentMessages: LlmMessage[] }): Promise<DieticianIntent> {
    const messages: LlmMessage[] = [
      ...input.recentMessages.filter((message) => message.role !== 'system'),
      { role: 'user', content: input.message },
    ];

    const result = await requestStructuredOutput({
      client: this.llmClient,
      request: {
        system: DIETICIAN_CLASSIFY_SYSTEM_PROMPT,
        messages,
        model: this.cheapModel,
        feature: 'dietician:classify',
      },
      resultSchema: dieticianIntentSchema,
    });

    return result.intent;
  }

  async runContextGathering(messages: LlmMessage[], tools: LlmToolDefinition[]): Promise<DieticianTurnResult> {
    const response = await this.llmClient.complete({
      system: DIETICIAN_GATHER_SYSTEM_PROMPT,
      messages,
      tools,
      model: this.cheapModel,
      feature: 'dietician:gather',
    });

    return {
      content: response.message.content,
      toolCalls: response.message.toolCalls,
    };
  }

  streamAdvice(messages: LlmMessage[]): AsyncIterable<string> {
    return this.llmClient.streamComplete({
      system: DIETICIAN_PERSONA,
      messages,
      model: this.primeModel,
      feature: 'dietician:advice',
    });
  }

  streamSmalltalk(messages: LlmMessage[]): AsyncIterable<string> {
    return this.llmClient.streamComplete({
      system: DIETICIAN_PERSONA,
      messages,
      model: this.cheapModel,
      feature: 'dietician:smalltalk',
    });
  }

  async summarizeConversation(input: SummarizeConversationInput): Promise<ConversationDigest> {
    const transcript = input.recentMessages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');

    const messages: LlmMessage[] = [
      ...(input.priorDigest
        ? [{ role: 'user' as const, content: `Previous summary:\n${JSON.stringify(input.priorDigest, null, 2)}` }]
        : []),
      { role: 'user', content: `Recent messages:\n${transcript}` },
    ];

    return requestStructuredOutput({
      client: this.llmClient,
      request: {
        system: DIETICIAN_DIGEST_SYSTEM_PROMPT,
        messages,
        model: this.cheapModel,
        feature: 'dietician:digest',
      },
      resultSchema: conversationDigestSchema,
    });
  }
}
