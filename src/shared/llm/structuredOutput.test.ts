import { z } from 'zod';
import type { LlmClient } from './LlmClient';
import { requestStructuredOutput } from './structuredOutput';
import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from './types';

class FakeLlmClient implements LlmClient {
  lastRequest?: LlmCompleteRequest;

  constructor(private readonly response: LlmCompleteResponse) {}

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.lastRequest = request;
    return this.response;
  }

  async *streamComplete(_request: LlmStreamCompleteRequest): AsyncIterable<string> {
    throw new Error('streamComplete is not used by structured output');
  }
}

describe('requestStructuredOutput', () => {
  const resultSchema = z.object({
    name: z.string(),
    age: z.number(),
    tags: z.array(z.string()).optional(),
  });

  it('forces the report_result tool and parses its call input against the schema', async () => {
    const client = new FakeLlmClient({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'report_result', input: { name: 'Ada', age: 30, tags: ['x'] } }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await requestStructuredOutput({
      client,
      request: { messages: [{ role: 'user', content: 'Extract info about Ada, 30.' }] },
      resultSchema,
    });

    expect(result).toEqual({ name: 'Ada', age: 30, tags: ['x'] });
    expect(client.lastRequest?.forceToolChoice).toEqual({ toolName: 'report_result' });
    expect(client.lastRequest?.tools).toEqual([
      expect.objectContaining({
        name: 'report_result',
        inputSchema: expect.objectContaining({
          type: 'object',
          required: ['name', 'age'],
          properties: expect.objectContaining({
            name: { type: 'string' },
            age: { type: 'number' },
          }),
        }),
      }),
    ]);
  });

  it('throws when the model does not call the forced tool', async () => {
    const client = new FakeLlmClient({
      message: { role: 'assistant', content: 'I will not call a tool.' },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await expect(
      requestStructuredOutput({ client, request: { messages: [] }, resultSchema }),
    ).rejects.toThrow();
  });

  it('throws when the tool call input fails schema validation', async () => {
    const client = new FakeLlmClient({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'report_result', input: { name: 'Ada' } }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await expect(
      requestStructuredOutput({ client, request: { messages: [] }, resultSchema }),
    ).rejects.toThrow();
  });
});
