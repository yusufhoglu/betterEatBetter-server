import type { IPolicy } from 'cockatiel';
import { z } from 'zod';
import { env } from '../../../../shared/config/env';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import type { LlmClient } from '../../../../shared/llm/LlmClient';
import { createLlmClient } from '../../../../shared/llm/llmClientFactory';
import { requestStructuredOutput } from '../../../../shared/llm/structuredOutput';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import type { TextEstimatorPort, TextEstimateResult } from '../../ports/TextEstimatorPort';

const logger = createModuleLogger('food-recognition');

const FEATURE = 'food-recognition-text';
const TEXT_ESTIMATOR_SYSTEM_PROMPT =
  'Estimate nutrition from a free-text meal description. Return exactly one structured result. ' +
  'Use status="sufficient" when the description is specific enough for a reasonable estimate. ' +
  'Use status="insufficient_data" when the text is too vague or ambiguous. Do not include extra prose.';

export const textEstimateSchema = z.object({
  status: z.enum(['sufficient', 'insufficient_data']),
  items: z.array(
    z.object({
      name: z.string(),
      portionGrams: z.number(),
      calories: z.number(),
      proteinGrams: z.number(),
      carbsGrams: z.number(),
      fatGrams: z.number(),
    }),
  ),
  macros: z.object({
    totalCalories: z.number(),
    totalProteinGrams: z.number(),
    totalCarbsGrams: z.number(),
    totalFatGrams: z.number(),
  }),
});

/**
 * Estimates nutrition from free text via the shared provider-agnostic LLM layer.
 * The result shape intentionally mirrors the photo estimator output so the same
 * ConfidencePolicy can be reused for both flows.
 */
export class LlmTextEstimator implements TextEstimatorPort {
  private readonly policy: IPolicy;

  constructor(
    private readonly llmClient: LlmClient = createLlmClient(),
    policy?: IPolicy,
  ) {
    this.policy = policy ?? buildResiliencePolicy({
      timeoutMs: 60_000,
      circuitBreakerThreshold: 5,
      circuitBreakerHalfOpenAfterMs: 30_000,
      retryAttempts: 2,
    });
  }

  async estimate(text: string): Promise<TextEstimateResult> {
    try {
      return await this.policy.execute(() =>
        requestStructuredOutput({
          client: this.llmClient,
          request: {
            system: TEXT_ESTIMATOR_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: text }],
            feature: FEATURE,
            model: env.FOOD_TEXT_MODEL,
          },
          resultSchema: textEstimateSchema,
          toolDescription: 'Report the nutrition estimate as structured meal data.',
        }),
      );
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw err;
      }

      logger.warn({ err }, 'text estimator circuit is open or timed out');
      throw new IntegrationError('LLM_CIRCUIT_OPEN', 'Text estimator is unavailable', false);
    }
  }
}
