import { env } from '../../../../shared/config/env';
import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type { LlmMessage, LlmToolDefinition } from '../../../../shared/llm/types';
import { CHATBOT_SYSTEM_PROMPT } from '../../chatSystemPrompt';
import type { LlmChatPort, LlmTurnResult } from '../../ports/LlmChatPort';

const FEATURE = 'chatbot';

/** Implements chatbot's LlmChatPort on top of shared/llm/LlmClient - the only file in this module allowed to touch shared/llm/. */
export class SharedLlmChatAdapter implements LlmChatPort {
  constructor(private readonly llmClient: LlmClient) {}

  async sendTurn(messages: LlmMessage[], tools?: LlmToolDefinition[]): Promise<LlmTurnResult> {
    const response = await this.llmClient.complete({
      system: CHATBOT_SYSTEM_PROMPT,
      messages,
      tools,
      feature: FEATURE,
      model: env.CHATBOT_MODEL,
    });

    return {
      content: response.message.content,
      toolCalls: response.message.toolCalls,
    };
  }

  streamFinalReply(messages: LlmMessage[]): AsyncIterable<string> {
    return this.llmClient.streamComplete({
      system: CHATBOT_SYSTEM_PROMPT,
      messages,
      feature: FEATURE,
      model: env.CHATBOT_MODEL,
    });
  }
}
