const createMock = jest.fn();
const streamMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: createMock, stream: streamMock },
  })),
}));

// eslint-disable-next-line import/first
import { AnthropicProvider } from './AnthropicProvider';

describe('AnthropicProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
    streamMock.mockReset();
  });

  it('translates canonical messages/system/tools into the Anthropic Messages API shape and back', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'call_1', name: 'get_weather', input: { location: 'Paris' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 12, output_tokens: 6 },
    });

    const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5' });

    const response = await provider.complete({
      system: 'You are helpful.',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          inputSchema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
        },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        system: 'You are helpful.',
        messages: [{ role: 'user', content: 'Weather in Paris?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather',
            input_schema: { type: 'object', properties: { location: { type: 'string' } }, required: ['location'] },
          },
        ],
      }),
    );

    expect(response).toEqual({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'get_weather', input: { location: 'Paris' } }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 12, outputTokens: 6 },
    });
  });

  it('merges consecutive canonical tool-result messages into a single Anthropic user turn', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Paris is sunny, Rome is cloudy.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 20, output_tokens: 10 },
    });

    const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5' });

    await provider.complete({
      messages: [
        { role: 'user', content: 'Weather in Paris and Rome?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call_1', name: 'get_weather', input: { location: 'Paris' } },
            { id: 'call_2', name: 'get_weather', input: { location: 'Rome' } },
          ],
        },
        { role: 'tool', toolCallId: 'call_1', content: '72F sunny' },
        { role: 'tool', toolCallId: 'call_2', content: '65F cloudy' },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Weather in Paris and Rome?' },
          {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'call_1', name: 'get_weather', input: { location: 'Paris' } },
              { type: 'tool_use', id: 'call_2', name: 'get_weather', input: { location: 'Rome' } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'call_1', content: '72F sunny' },
              { type: 'tool_result', tool_use_id: 'call_2', content: '65F cloudy' },
            ],
          },
        ],
      }),
    );
  });

  it('forces a specific tool call via forceToolChoice', async () => {
    createMock.mockResolvedValue({ content: [], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } });
    const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5' });

    await provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'report_result', description: 'd', inputSchema: {} }],
      forceToolChoice: { toolName: 'report_result' },
    });

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ tool_choice: { type: 'tool', name: 'report_result' } }));
  });

  it('streams text deltas via streamComplete', async () => {
    async function* fakeEvents() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } };
    }
    streamMock.mockReturnValue({
      [Symbol.asyncIterator]: fakeEvents,
      finalMessage: jest.fn().mockResolvedValue({ usage: { input_tokens: 4, output_tokens: 2 } }),
    });

    const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5' });
    const chunks: string[] = [];
    for await (const chunk of provider.streamComplete({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
  });

  it('throws when a system-role message appears in messages[] instead of request.system', async () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-opus-5' });

    await expect(provider.complete({ messages: [{ role: 'system', content: 'bad' }] })).rejects.toThrow();
  });
});
