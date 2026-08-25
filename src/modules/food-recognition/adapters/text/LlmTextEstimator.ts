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
  'Use status="insufficient_data" when the text is too vague or ambiguous. ' +
  'Always include a `macros` object with numeric totals for calories, protein, carbs, and fat. ' +
  'The `macros` totals must equal the sum of all items, even when there is only one item. ' +
  'Do not include extra prose.';

const textEstimateItemSchema = z.object({
  name: z.string(),
  portionGrams: z.number(),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
});

const relaxedTextEstimateSchema = z.object({
  status: z.enum(['sufficient', 'insufficient_data']),
  items: z.array(textEstimateItemSchema),
  macros: z
    .object({
      totalCalories: z.number().optional(),
      totalProteinGrams: z.number().optional(),
      totalCarbsGrams: z.number().optional(),
      totalFatGrams: z.number().optional(),
    })
    .optional(),
});

export const textEstimateSchema = z.object({
  status: z.enum(['sufficient', 'insufficient_data']),
  items: z.array(textEstimateItemSchema),
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
      const rawResult = await this.policy.execute(() =>
        requestStructuredOutput({
          client: this.llmClient,
          request: {
            system: TEXT_ESTIMATOR_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: text }],
            feature: FEATURE,
            model: env.FOOD_TEXT_MODEL,
          },
          resultSchema: relaxedTextEstimateSchema,
          toolDescription: 'Report the nutrition estimate as structured meal data.',
        }),
      );

      return textEstimateSchema.parse({
        status: rawResult.status,
        items: rawResult.items,
        macros: {
          totalCalories:
            rawResult.macros?.totalCalories ?? sum(rawResult.items, (item) => item.calories),
          totalProteinGrams:
            rawResult.macros?.totalProteinGrams ?? sum(rawResult.items, (item) => item.proteinGrams),
          totalCarbsGrams:
            rawResult.macros?.totalCarbsGrams ?? sum(rawResult.items, (item) => item.carbsGrams),
          totalFatGrams:
            rawResult.macros?.totalFatGrams ?? sum(rawResult.items, (item) => item.fatGrams),
        },
      });
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw err;
      }

      if (err instanceof z.ZodError) {
        logger.warn({ err }, 'text estimator returned schema-invalid structured output');
        throw new IntegrationError(
          'LLM_INVALID_RESPONSE',
          'Text estimator returned invalid structured output',
          false,
        );
      }

      logger.warn({ err }, 'text estimator circuit is open or timed out');
      throw new IntegrationError('LLM_CIRCUIT_OPEN', 'Text estimator is unavailable', false);
    }
  }
}

function sum(
  items: Array<z.infer<typeof textEstimateItemSchema>>,
  select: (item: z.infer<typeof textEstimateItemSchema>) => number,
): number {
  return items.reduce((total, item) => total + select(item), 0);
}
