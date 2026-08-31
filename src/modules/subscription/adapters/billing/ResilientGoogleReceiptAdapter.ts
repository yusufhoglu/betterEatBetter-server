import type { IPolicy } from 'cockatiel';
import { DomainError } from '../../../../shared/errors/DomainError';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import type { ReceiptValidatorPort } from '../../ports/ReceiptValidatorPort';

const logger = createModuleLogger('subscription');

const TIMEOUT_MS = 10_000;

/**
 * Wraps GoogleReceiptAdapter (or any ReceiptValidatorPort) with timeout +
 * circuit breaker + retry, same shape as food-recognition's
 * ResilientPhotoEstimator — the policy is built once and shared across calls
 * so the circuit breaker is meaningful.
 */
export class ResilientGoogleReceiptAdapter implements ReceiptValidatorPort {
  private readonly policy: IPolicy;

  constructor(
    private readonly inner: ReceiptValidatorPort,
    policy?: IPolicy,
  ) {
    this.policy =
      policy ??
      buildResiliencePolicy({
        timeoutMs: TIMEOUT_MS,
        circuitBreakerThreshold: 5,
        circuitBreakerHalfOpenAfterMs: 30_000,
        retryAttempts: 2,
      });
  }

  async validate(input: {
    productId: string;
    receiptToken: string;
  }): Promise<{
    productId: string;
    status: 'active' | 'canceled';
    expiresAt: Date | null;
    willRenew: boolean;
    inGracePeriod: boolean;
  }> {
    try {
      return await this.policy.execute(() => this.inner.validate(input));
    } catch (err) {
      // Rethrow any DomainError as-is (ValidationError for a bad token must
      // stay a 400, not get relabeled as a 502 circuit-open failure) — only
      // cockatiel's own failures (BrokenCircuitError, TaskCancelledError)
      // fall through to the generic message below.
      if (err instanceof DomainError) {
        throw err;
      }
      logger.warn({ err }, 'Google Play receipt validator circuit is open or timed out');
      throw new IntegrationError('PLAY_API_ERROR', 'Google Play verification is unavailable', false);
    }
  }
}
