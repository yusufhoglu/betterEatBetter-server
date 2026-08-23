import { z } from 'zod';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { getTraceId } from '../../../../shared/observability/tracer';
import type { TextEstimatorPort, TextEstimateResult } from '../../ports/TextEstimatorPort';

const logger = createModuleLogger('food-recognition');

const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL ?? 'http://localhost:11434';

const llmResponseSchema = z.object({
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
 * Sends a free-text food description to the LLM service and receives a structured
 * food estimate. Uses the same response shape as Python RAG so ConfidencePolicy
 * applies identically to both photo and text flows.
 */
export class LlmTextEstimator implements TextEstimatorPort {
  private readonly baseUrl: string;

  constructor(baseUrl: string = LLM_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  async estimate(text: string): Promise<TextEstimateResult> {
    const traceId = getTraceId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/food/estimate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      logger.error({ err }, 'LLM service network error');
      throw new IntegrationError('LLM_NETWORK_ERROR', 'Could not reach LLM service', true);
    }

    if (!response.ok) {
      throw new IntegrationError(
        'LLM_SERVICE_ERROR',
        `LLM service returned ${response.status}`,
        response.status >= 500,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new IntegrationError('LLM_INVALID_RESPONSE', 'LLM service returned non-JSON body', false);
    }

    const parsed = llmResponseSchema.safeParse(body);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.issues }, 'LLM response schema mismatch');
      throw new IntegrationError('LLM_SCHEMA_ERROR', 'LLM response did not match expected schema', false);
    }

    return parsed.data;
  }
}
