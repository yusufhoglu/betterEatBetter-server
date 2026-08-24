jest.mock('../config/env', () => ({
  env: {
    LLM_PROVIDER: 'openai' as 'openai' | 'anthropic',
    OPENAI_API_KEY: undefined as string | undefined,
    OPENAI_MODEL: 'gpt-4o',
    ANTHROPIC_API_KEY: undefined as string | undefined,
    ANTHROPIC_MODEL: 'claude-sonnet-4-6',
  },
}));

// eslint-disable-next-line import/first
import { env } from '../config/env';
// eslint-disable-next-line import/first
import { createLlmClient, registerLlmProvider } from './llmClientFactory';
// eslint-disable-next-line import/first
import type { LlmClient } from './LlmClient';
// eslint-disable-next-line import/first
import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from './types';

/**
 * Stands in for a not-yet-written provider (e.g. DeepSeek). Registered only
 * from this test file, never touching llmClientFactory.ts's source — proof
 * that a new provider is exactly "one new file that registers itself".
 */
class MockLlmClient implements LlmClient {
  async complete(_request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    return {
      message: { role: 'assistant', content: 'mock response' },
      stopReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async *streamComplete(_request: LlmStreamCompleteRequest): AsyncIterable<string> {
    yield 'mock';
    yield ' stream';
  }
}

describe('createLlmClient extensibility', () => {
  beforeEach(() => {
    env.OPENAI_API_KEY = undefined;
    env.ANTHROPIC_API_KEY = undefined;
  });

  it('runs a third-party "mock" provider registered only by this test, via LLM_PROVIDER selection', async () => {
    registerLlmProvider('mock', () => new MockLlmClient());

    const client = createLlmClient({ provider: 'mock' });

    const response = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(response.message.content).toBe('mock response');

    const chunks: string[] = [];
    for await (const chunk of client.streamComplete({ messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push(chunk);
    }
    expect(chunks.join('')).toBe('mock stream');
  });

  it('throws a clear error for an unregistered provider name', () => {
    expect(() => createLlmClient({ provider: 'does-not-exist' })).toThrow(/Unknown LLM_PROVIDER/);
  });

  it('throws a clear error when the built-in openai provider is selected without an API key', () => {
    expect(() => createLlmClient({ provider: 'openai' })).toThrow(/OPENAI_API_KEY/);
  });

  it('throws a clear error when the built-in anthropic provider is selected without an API key', () => {
    expect(() => createLlmClient({ provider: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('constructs the built-in openai provider once OPENAI_API_KEY is present via the shared env module', () => {
    env.OPENAI_API_KEY = 'test-key';

    expect(() => createLlmClient({ provider: 'openai' })).not.toThrow();
  });

  it('falls back to env.LLM_PROVIDER when no provider option is passed', () => {
    env.OPENAI_API_KEY = 'test-key';

    expect(() => createLlmClient()).not.toThrow();
  });
});
