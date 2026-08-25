import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { env } from '../../../../shared/config/env';
import type { PhotoEstimatorPort, PhotoEstimateResult } from '../../ports/PhotoEstimatorPort';
import type { IPolicy } from 'cockatiel';

const logger = createModuleLogger('food-recognition');

/**
 * Wraps RagHttpEstimator (or any PhotoEstimatorPort) with:
 * - Timeout: 60 seconds (generous — RAG can take 15-30s)
 * - Circuit breaker: 5 consecutive failures → open, 30s half-open
 * - Retry: only for retryable IntegrationErrors
 *
 * The policy is built once at construction time and shared across all calls
 * (mandatory for circuit breakers to be meaningful).
 */
export class ResilientPhotoEstimator implements PhotoEstimatorPort {
  private readonly policy: IPolicy;

  constructor(
    private readonly inner: PhotoEstimatorPort,
    policy?: IPolicy,
  ) {
    this.policy = policy ?? buildResiliencePolicy({
      timeoutMs: env.PHOTO_ESTIMATOR_TIMEOUT_MS,
      circuitBreakerThreshold: 5,
      circuitBreakerHalfOpenAfterMs: 30_000,
      retryAttempts: 2,
    });
  }

  async estimate(photoUrl: string): Promise<PhotoEstimateResult> {
    try {
      return await this.policy.execute(() => this.inner.estimate(photoUrl));
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw err;
      }
      // Cockatiel wraps circuit-breaker-open as a BrokenCircuitError
      logger.warn({ err }, 'photo estimator circuit is open or timed out');
      throw new IntegrationError('RAG_CIRCUIT_OPEN', 'Photo estimator is unavailable', false);
    }
  }
}
