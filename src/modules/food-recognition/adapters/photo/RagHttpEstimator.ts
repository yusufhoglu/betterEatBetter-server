import { randomUUID } from 'node:crypto';
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
    requestId: z.string(),
    status: z.literal('completed'),
    estimate: z.object({
      confidenceStatus: z.enum(['sufficient', 'insufficient_data']),
      items: z.array(
        z.object({
          name: z.string(),
          confidence: z.number(),
          portionGrams: z.number(),
          calories: z.number(),
          proteinG: z.number(),
          carbsG: z.number(),
          fatG: z.number(),
          vitaminAMcg: z.number(),
          vitaminCMg: z.number(),
          vitaminDMcg: z.number(),
          calciumMg: z.number(),
          ironMg: z.number(),
          potassiumMg: z.number(),
          cholesterolMg: z.number(),
        }),
      ),
    }),
    modelVersion: z.string(),
    processingTimeMs: z.number(),
  }),
  z.object({
    requestId: z.string(),
    status: z.literal('failed'),
    error: z.object({
      code: z.enum(['IMAGE_UNREADABLE', 'MODEL_ERROR']),
      message: z.string(),
    }),
    processingTimeMs: z.number(),
  }),
]);

export type RagResponse = z.infer<typeof ragResponseSchema>;

function formatRagFailureMessage(data: Extract<RagResponse, { status: 'failed' }>): string {
  return `[${data.error.code}] ${data.error.message} (requestId: ${data.requestId})`;
}

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
    const requestId = traceId ?? randomUUID();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/meals/estimate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageUrl: photoUrl, requestId }),
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

    if (data.status === 'failed') {
      logger.error(
        {
          requestId: data.requestId,
          ragErrorCode: data.error.code,
          processingTimeMs: data.processingTimeMs,
          ragResponse: body,
        },
        'RAG service reported processing failure',
      );
      throw new IntegrationError('RAG_PROCESSING_ERROR', formatRagFailureMessage(data), false);
    }

    return {
      status: data.estimate.confidenceStatus,
      items: data.estimate.items.map((item) => ({
        name: item.name,
        portionGrams: item.portionGrams,
        calories: item.calories,
        proteinGrams: item.proteinG,
        carbsGrams: item.carbsG,
        fatGrams: item.fatG,
        vitaminAMcg: item.vitaminAMcg,
        vitaminCMg: item.vitaminCMg,
        vitaminDMcg: item.vitaminDMcg,
        calciumMg: item.calciumMg,
        ironMg: item.ironMg,
        potassiumMg: item.potassiumMg,
        cholesterolMg: item.cholesterolMg,
      })),
      raw: body,
    };
  }
}
