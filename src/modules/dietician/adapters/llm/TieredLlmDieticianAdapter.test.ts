import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type {
  LlmCompleteRequest,
  LlmCompleteResponse,
  LlmStreamCompleteRequest,
} from '../../../../shared/llm/types';
import { assistantGatherSystemPrompt, assistantSystemPrompt } from '../../domain/assistantPersonaBlock';
import { DIETICIAN_GATHER_SYSTEM_PROMPT, DIETICIAN_PERSONA } from '../../dieticianSystemPrompt';
import type { DietitianPersona } from '../../ports/CoachAccessPort';
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
    expect(client.completeRequests[0]).toMatchObject({
      model: 'cheap-model',
      feature: 'dietician:classify',
      reasoningEffort: 'minimal',
    });
  });

  it('runContextGathering uses the cheap model and the dietician:gather feature', async () => {
    const { client, adapter } = build();

    const result = await adapter.runContextGathering([{ role: 'user', content: 'hi' }], []);

    expect(result.content).toBe('let me check');
    expect(client.completeRequests[0]).toMatchObject({ model: 'cheap-model', feature: 'dietician:gather' });
    expect(client.completeRequests[0]!.forceToolChoice).toBeUndefined();
  });

  it('runContextGathering forwards forceToolChoice to the client', async () => {
    const { client, adapter } = build();

    const result = await adapter.runContextGathering([{ role: 'user', content: 'rate this' }], [], {
      toolName: 'rate_meal',
    });

    expect(client.completeRequests[0]!.forceToolChoice).toEqual({ toolName: 'rate_meal' });
    expect(result.toolCalls?.[0]?.name).toBe('rate_meal');
  });

  it('streamAdvice uses the PRIME model and the dietician:advice feature', async () => {
    const { client, adapter } = build();

    for await (const _ of adapter.streamAdvice([{ role: 'user', content: 'advice' }])) {
      // drain
    }

    expect(client.streamRequests[0]).toMatchObject({
      model: 'prime-model',
      feature: 'dietician:advice',
      reasoningEffort: 'low',
    });
  });

  it('streamSmalltalk uses the cheap model and the dietician:smalltalk feature', async () => {
    const { client, adapter } = build();

    for await (const _ of adapter.streamSmalltalk([{ role: 'user', content: 'hey' }])) {
      // drain
    }

    expect(client.streamRequests[0]).toMatchObject({
      model: 'cheap-model',
      feature: 'dietician:smalltalk',
      reasoningEffort: 'minimal',
    });
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

  describe("a dietitian's assistant", () => {
    const persona: DietitianPersona = {
      dietitianId: 'dyt-1',
      dietitianName: 'Ayşe',
      assistantName: 'Ayşe · AI asistan',
      addressForm: null,
      tone: null,
      approach: null,
      rules: [],
      avoid: ['Asla yemek tarifi verme.'],
      handoffMessage: null,
      clientInstructions: null,
      examples: [],
    };

    async function drain(stream: AsyncIterable<string>): Promise<void> {
      for await (const _ of stream) {
        // consume
      }
    }

    it('replaces the generic coach system prompt on every stage — never both', async () => {
      const { client, adapter } = build();

      await adapter.runContextGathering([{ role: 'user', content: 'x' }], [], undefined, persona);
      await drain(adapter.streamAdvice([{ role: 'user', content: 'x' }], persona));
      await drain(adapter.streamSmalltalk([{ role: 'user', content: 'x' }], persona));
      await adapter.previewReply([{ role: 'user', content: 'x' }], persona);

      expect(client.completeRequests[0]!.system).toBe(assistantGatherSystemPrompt(persona));
      expect(client.streamRequests.map((r) => r.system)).toEqual([assistantSystemPrompt(persona), assistantSystemPrompt(persona)]);
      expect(client.completeRequests[1]).toMatchObject({ system: assistantSystemPrompt(persona), model: 'prime-model', feature: 'dietician:assistant_preview' });
      for (const request of [...client.completeRequests, ...client.streamRequests]) {
        expect(request.system).not.toContain(DIETICIAN_PERSONA);
      }
    });

    it('without a persona the generic coach prompts are used unchanged', async () => {
      const { client, adapter } = build();

      await adapter.runContextGathering([{ role: 'user', content: 'x' }], []);
      await drain(adapter.streamAdvice([{ role: 'user', content: 'x' }], null));

      expect(client.completeRequests[0]!.system).toBe(DIETICIAN_GATHER_SYSTEM_PROMPT);
      expect(client.streamRequests[0]!.system).toBe(DIETICIAN_PERSONA);
    });
  });
});
