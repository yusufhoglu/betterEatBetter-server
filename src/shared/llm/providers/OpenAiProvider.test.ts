const createMock = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

// eslint-disable-next-line import/first
import { OpenAiProvider } from './OpenAiProvider';

describe('OpenAiProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('translates a canonical request into the OpenAI Chat Completions shape and back', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o' });

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
      feature: 'test-feature',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Weather in Paris?' },
        ],
        tools: [
          {
            type: 'function',
            function: { name: 'get_weather', description: 'Get weather', parameters: expect.any(Object) },
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
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it('merges an assistant tool call and its canonical tool result into OpenAI message shapes', async () => {
    createMock.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'It is sunny.' } }],
      usage: { prompt_tokens: 20, completion_tokens: 8 },
    });

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o' });

    await provider.complete({
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'get_weather', input: { location: 'Paris' } }],
        },
        { role: 'tool', toolCallId: 'call_1', content: '72F sunny' },
      ],
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: '72F sunny' },
        ],
      }),
    );
  });

  it('forces a specific tool call via forceToolChoice', async () => {
    createMock.mockResolvedValue({
      choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o' });

    await provider.complete({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'report_result', description: 'd', inputSchema: {} }],
      forceToolChoice: { toolName: 'report_result' },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ tool_choice: { type: 'function', function: { name: 'report_result' } } }),
    );
  });

  it('streams text deltas via streamComplete', async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: 'Hello' } }] };
      yield { choices: [{ delta: { content: ' world' } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 3, completion_tokens: 2 } };
    }
    createMock.mockResolvedValue(fakeStream());

    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o' });
    const chunks: string[] = [];
    for await (const chunk of provider.streamComplete({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true, stream_options: { include_usage: true } }),
    );
  });

  it('throws a taxonomy error when a tool message is missing toolCallId', async () => {
    const provider = new OpenAiProvider({ apiKey: 'test-key', model: 'gpt-4o' });

    await expect(
      provider.complete({ messages: [{ role: 'tool', content: 'oops' }] }),
    ).rejects.toThrow();
  });
});
