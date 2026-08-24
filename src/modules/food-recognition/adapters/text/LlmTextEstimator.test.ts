import type { LlmClient } from '../../../../shared/llm/LlmClient';
import type { LlmCompleteRequest, LlmCompleteResponse, LlmStreamCompleteRequest } from '../../../../shared/llm/types';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import { env } from '../../../../shared/config/env';
import { LlmTextEstimator } from './LlmTextEstimator';

class FakeLlmClient implements LlmClient {
  callCount = 0;
  lastRequest?: LlmCompleteRequest & { model?: string };

  constructor(private readonly completeImpl: (request: LlmCompleteRequest & { model?: string }) => Promise<LlmCompleteResponse>) {}

  async complete(request: LlmCompleteRequest): Promise<LlmCompleteResponse> {
    this.callCount += 1;
    this.lastRequest = request as LlmCompleteRequest & { model?: string };
    return this.completeImpl(this.lastRequest);
  }

  async *streamComplete(_request: LlmStreamCompleteRequest): AsyncIterable<string> {
    throw new Error('streamComplete is not used by LlmTextEstimator');
  }
}

describe('LlmTextEstimator', () => {
  it('calls shared/llm structured output with feature and explicit FOOD_TEXT_MODEL', async () => {
    const fakeClient = new FakeLlmClient(async () => ({
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call_1',
          name: 'report_result',
          input: {
            status: 'sufficient',
            items: [{
              name: 'Chicken salad',
              portionGrams: 250,
              calories: 380,
              proteinGrams: 32,
              carbsGrams: 18,
              fatGrams: 17,
            }],
            macros: {
              totalCalories: 380,
              totalProteinGrams: 32,
              totalCarbsGrams: 18,
              totalFatGrams: 17,
            },
          },
        }],
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 12, outputTokens: 8 },
    }));
    const estimator = new LlmTextEstimator(fakeClient);

    const result = await estimator.estimate('A chicken salad with olive oil dressing');

    expect(result.status).toBe('sufficient');
    expect(result.items[0]?.name).toBe('Chicken salad');
    expect(fakeClient.lastRequest).toEqual(
      expect.objectContaining({
        feature: 'food-recognition-text',
        model: env.FOOD_TEXT_MODEL,
        forceToolChoice: { toolName: 'report_result' },
        tools: [
          expect.objectContaining({
            name: 'report_result',
          }),
        ],
      }),
    );
  });

  it('opens the circuit after 5 consecutive failures and stops calling the inner client', async () => {
    const permanentError = new IntegrationError('LLM_SERVICE_ERROR', 'Service down', false);
    const fakeClient = new FakeLlmClient(async () => {
      throw permanentError;
    });
    const policy = buildResiliencePolicy({
      timeoutMs: 5_000,
      circuitBreakerThreshold: 5,
      circuitBreakerHalfOpenAfterMs: 30_000,
    });
    const estimator = new LlmTextEstimator(fakeClient, policy);

    for (let i = 0; i < 5; i++) {
      await expect(estimator.estimate('text')).rejects.toThrow(permanentError);
    }

    const callCountAfterFiveFailures = fakeClient.callCount;
    expect(callCountAfterFiveFailures).toBe(5);

    await expect(estimator.estimate('text')).rejects.toThrow();
    expect(fakeClient.callCount).toBe(callCountAfterFiveFailures);
  });
});
