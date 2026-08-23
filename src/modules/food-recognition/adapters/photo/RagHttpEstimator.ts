import { z } from 'zod';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { getTraceId } from '../../../../shared/observability/tracer';
import { env } from '../../../../shared/config/env';
import type { PhotoEstimatorPort, PhotoEstimateResult } from '../../ports/PhotoEstimatorPort';

const logger = createModuleLogger('food-recognition');

/** Zod schema for the Python RAG service response. */
export const ragResponseSchema = z.union([
  z.object({
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
  }),
  z.object({
    error: z.string(),
    message: z.string().optional(),
  }),
]);

export type RagResponse = z.infer<typeof ragResponseSchema>;

/**
 * Sends the pending photo URL to the Python RAG service.
 * Forwards the x-trace-id header from AsyncLocalStorage — no parameter passing needed.
 */
export class RagHttpEstimator implements PhotoEstimatorPort {
  private readonly baseUrl: string;

  constructor(baseUrl: string = env.RAG_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  async estimate(photoUrl: string): Promise<PhotoEstimateResult> {
    const traceId = getTraceId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/estimate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ photo_url: photoUrl }),
      });
    } catch (err) {
      logger.error({ err }, 'RAG service network error');
      throw new IntegrationError('RAG_NETWORK_ERROR', 'Could not reach RAG service', true);
    }

    if (!response.ok) {
      const retryable = response.status >= 500;
      logger.error({ status: response.status }, 'RAG service returned error status');
      throw new IntegrationError(
        'RAG_SERVICE_ERROR',
        `RAG service returned ${response.status}`,
        retryable,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new IntegrationError('RAG_INVALID_RESPONSE', 'RAG service returned non-JSON body', false);
    }

    const parsed = ragResponseSchema.safeParse(body);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.issues }, 'RAG response schema mismatch');
      throw new IntegrationError('RAG_SCHEMA_ERROR', 'RAG service response did not match expected schema', false);
    }

    const data = parsed.data;

    // Error response from Python
    if ('error' in data) {
      throw new IntegrationError('RAG_PROCESSING_ERROR', data.message ?? data.error, false);
    }

    return {
      status: data.status,
      items: data.items,
      macros: data.macros,
      raw: body,
    };
  }
}
