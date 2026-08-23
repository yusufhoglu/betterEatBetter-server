import { ResilientPhotoEstimator } from './ResilientPhotoEstimator';
import { FakePhotoEstimator } from '../../test-utils/fakes/FakePhotoEstimator';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';

describe('ResilientPhotoEstimator', () => {
  it('returns result from inner estimator when it succeeds', async () => {
    const inner = FakePhotoEstimator.sufficient();
    const estimator = new ResilientPhotoEstimator(inner);

    const result = await estimator.estimate('https://example.com/photo.jpg');

    expect(result.status).toBe('sufficient');
    expect(result.items.length).toBeGreaterThan(0);
  });

  describe('circuit breaker behavior', () => {
    it('opens the circuit after 5 consecutive failures and stops calling the inner estimator', async () => {
      // Use a short half-open window so we don't need to wait 30s in tests
      const policy = buildResiliencePolicy({
        timeoutMs: 5_000,
        circuitBreakerThreshold: 5,
        circuitBreakerHalfOpenAfterMs: 30_000,
      });

      const permanentError = new IntegrationError('RAG_SERVICE_ERROR', 'Service down', false);
      const inner = FakePhotoEstimator.alwaysFails(permanentError);
      const estimator = new ResilientPhotoEstimator(inner, policy);

      // Make 5 calls — these should all fail and count towards the breaker
      for (let i = 0; i < 5; i++) {
        await expect(estimator.estimate('url')).rejects.toThrow();
      }

      const callCountAfterFiveFailures = inner.callCount;
      expect(callCountAfterFiveFailures).toBe(5);

      // The 6th call — circuit should be open, inner estimator must NOT be called
      await expect(estimator.estimate('url')).rejects.toThrow();

      // Inner's callCount must NOT have increased — circuit is open
      expect(inner.callCount).toBe(callCountAfterFiveFailures);
    });
  });
});
