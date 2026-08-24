const openAiCreateMock = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: openAiCreateMock } },
  })),
}));

import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from '../../../../shared/llm/types';
import { env } from '../../../../shared/config/env';
import { OpenAiProvider } from '../../../../shared/llm/providers/OpenAiProvider';
import { CHATBOT_SYSTEM_PROMPT } from '../../chatSystemPrompt';
import { SharedLlmChatAdapter } from './SharedLlmChatAdapter';

class FakeLlmClient implements LlmClient {
  lastCompleteRequest?: LlmCompleteRequest;
  lastStreamRequest?: LlmStreamCompleteRequest;

  constructor(
    private readonly completeResponse: LlmCompleteResponse,
    private readonly streamChunks: string[] = [],
  ) {}

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.lastCompleteRequest = request;
    return this.completeResponse;
  }

  async *streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string> {
    this.lastStreamRequest = request;
    for (const chunk of this.streamChunks) {
      yield chunk;
    }
  }
}

describe('SharedLlmChatAdapter', () => {
  beforeEach(() => {
    openAiCreateMock.mockReset();
  });

  it('sendTurn calls complete() with feature: "chatbot" and maps the response to LlmTurnResult', async () => {
    const fakeClient = new FakeLlmClient({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'get_meal_data', input: { date: '2026-08-24' } }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const adapter = new SharedLlmChatAdapter(fakeClient);

    const messages = [{ role: 'user' as const, content: 'How am I doing today?' }];
    const tools = [{ name: 'get_meal_data', description: 'd', inputSchema: { type: 'object' } }];

    const result = await adapter.sendTurn(messages, tools);

    expect(fakeClient.lastCompleteRequest).toEqual({
      messages,
      tools,
      feature: 'chatbot',
      model: env.CHATBOT_MODEL,
      system: CHATBOT_SYSTEM_PROMPT,
    });
    expect(result).toEqual({
      content: '',
      toolCalls: [{ id: 'call_1', name: 'get_meal_data', input: { date: '2026-08-24' } }],
    });
  });

  it('streamFinalReply calls streamComplete() with feature: "chatbot" and yields its chunks', async () => {
    const fakeClient = new FakeLlmClient(
      { message: { role: 'assistant', content: '' }, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1 } },
      ['Hello', ' there'],
    );
    const adapter = new SharedLlmChatAdapter(fakeClient);
    const messages = [{ role: 'user' as const, content: 'Hi' }];

    const chunks: string[] = [];
    for await (const chunk of adapter.streamFinalReply(messages)) {
      chunks.push(chunk);
    }

    expect(fakeClient.lastStreamRequest).toEqual({
      messages,
      feature: 'chatbot',
      model: env.CHATBOT_MODEL,
      system: CHATBOT_SYSTEM_PROMPT,
    });
    expect(chunks.join('')).toBe('Hello there');
  });

  it('passes CHATBOT_MODEL through to the real OpenAI provider on complete()', async () => {
    openAiCreateMock.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Hello back' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'provider-default-model' });
    const adapter = new SharedLlmChatAdapter(provider);

    const result = await adapter.sendTurn([{ role: 'user', content: 'Hello' }]);

    expect(openAiCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: env.CHATBOT_MODEL,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: CHATBOT_SYSTEM_PROMPT }),
          expect.objectContaining({ role: 'user', content: 'Hello' }),
        ]),
      }),
    );
    expect(result.content).toBe('Hello back');
  });

  it('passes CHATBOT_MODEL through to the real OpenAI provider on streamComplete()', async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: 'Hello' } }] };
      yield { choices: [{ delta: { content: ' there' } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 3, completion_tokens: 2 } };
    }
    openAiCreateMock.mockResolvedValue(fakeStream());

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'provider-default-model' });
    const adapter = new SharedLlmChatAdapter(provider);

    const chunks: string[] = [];
    for await (const chunk of adapter.streamFinalReply([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    expect(openAiCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: env.CHATBOT_MODEL,
        stream: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system', content: CHATBOT_SYSTEM_PROMPT }),
          expect.objectContaining({ role: 'user', content: 'Hello' }),
        ]),
      }),
    );
    expect(chunks.join('')).toBe('Hello there');
  });
});
