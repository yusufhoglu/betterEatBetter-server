import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmStreamCompleteRequest,
} from '../../../../shared/llm/types';
import { TieredLlmDieticianAdapter } from './TieredLlmDieticianAdapter';

class FakeLlmClient implements LlmClient {
  readonly completeRequests: LlmCompleteRequest[] = [];
  readonly streamRequests: LlmStreamCompleteRequest[] = [];

  /** Value the forced structured-output tool call returns. */
  structuredResult: Record<string, unknown> = { intent: 'advice' };
  gatherContent = 'let me check';

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.completeRequests.push(request);
    const usage = { inputTokens: 1, outputTokens: 1 };

    if (request.forceToolChoice) {
      return {
        message: {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: request.forceToolChoice.toolName, input: this.structuredResult }],
        },
        stopReason: 'tool_use',
        usage,
      };
    }

    return {
      message: { role: 'assistant', content: this.gatherContent },
      stopReason: 'end_turn',
      usage,
    };
  }

  async *streamComplete(request: LlmStreamCompleteRequest): AsyncIterable<string> {
    this.streamRequests.push(request);
    yield 'streamed';
  }
}

function build() {
  const client = new FakeLlmClient();
  const adapter = new TieredLlmDieticianAdapter(client, 'cheap-model', 'prime-model');
  return { client, adapter };
}

describe('TieredLlmDieticianAdapter', () => {
  it('classifyIntent uses the cheap model and the dietician:classify feature', async () => {
    const { client, adapter } = build();
    client.structuredResult = { intent: 'quick_fact' };

    const intent = await adapter.classifyIntent({ message: 'protein in an egg?', recentMessages: [] });

    expect(intent).toBe('quick_fact');
    expect(client.completeRequests[0]).toMatchObject({ model: 'cheap-model', feature: 'dietician:classify' });
  });

  it('runContextGathering uses the cheap model and the dietician:gather feature', async () => {
    const { client, adapter } = build();

    const result = await adapter.runContextGathering([{ role: 'user', content: 'hi' }], []);

    expect(result.content).toBe('let me check');
    expect(client.completeRequests[0]).toMatchObject({ model: 'cheap-model', feature: 'dietician:gather' });
  });

  it('streamAdvice uses the PRIME model and the dietician:advice feature', async () => {
    const { client, adapter } = build();

    for await (const _ of adapter.streamAdvice([{ role: 'user', content: 'advice' }])) {
      // drain
    }

    expect(client.streamRequests[0]).toMatchObject({ model: 'prime-model', feature: 'dietician:advice' });
  });

  it('streamSmalltalk uses the cheap model and the dietician:smalltalk feature', async () => {
    const { client, adapter } = build();

    for await (const _ of adapter.streamSmalltalk([{ role: 'user', content: 'hey' }])) {
      // drain
    }

    expect(client.streamRequests[0]).toMatchObject({ model: 'cheap-model', feature: 'dietician:smalltalk' });
  });

  it('summarizeConversation uses the cheap model and the dietician:digest feature', async () => {
    const { client, adapter } = build();
    client.structuredResult = {
      goalsRecap: 'g',
      adviceGivenRecap: 'a',
      openThreads: 'o',
      learnedPreferences: 'p',
    };

    const digest = await adapter.summarizeConversation({
      priorDigest: null,
      recentMessages: [{ role: 'user', content: 'hi' }],
    });

    expect(digest).toEqual({ goalsRecap: 'g', adviceGivenRecap: 'a', openThreads: 'o', learnedPreferences: 'p' });
    expect(client.completeRequests[0]).toMatchObject({ model: 'cheap-model', feature: 'dietician:digest' });
  });
});
