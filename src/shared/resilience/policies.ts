import {
  ConsecutiveBreaker,
  ExponentialBackoff,
  type IPolicy,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  isTaskCancelledError,
  retry,
  timeout,
  wrap,
} from 'cockatiel';
import { env } from '../config/env';
import { IntegrationError } from '../errors/IntegrationError';

export interface ResiliencePolicyOptions {
  /** Per-call timeout, in milliseconds. */
  timeoutMs: number;
  /** Consecutive failures before the breaker opens. Defaults to 5 (rule default). */
  circuitBreakerThreshold?: number;
  /** How long the breaker stays open before trying a half-open call. Defaults to 30s. */
  circuitBreakerHalfOpenAfterMs?: number;
  /** Max retry attempts for retryable failures. Defaults to 2. */
  retryAttempts?: number;
}

/**
 * Builds a composed timeout + circuit-breaker + retry policy for one
 * outbound integration. Each adapter (Python RAG, LLM, barcode API, ...)
 * calls this once with its own thresholds and shares the resulting policy
 * across its calls, since a circuit breaker must be shared to be meaningful.
 *
 * Retry only ever fires for `IntegrationError`s explicitly marked
 * `retryable: true` — timeouts and model errors are usually not retried, to
 * avoid wasting capacity on a call that's unlikely to succeed.
 */
export function buildResiliencePolicy(options: ResiliencePolicyOptions): IPolicy {
  const {
    timeoutMs,
    circuitBreakerThreshold = 5,
    circuitBreakerHalfOpenAfterMs = 30_000,
    retryAttempts = 2,
  } = options;

  const retryableFailures = handleWhen((err) => err instanceof IntegrationError && err.retryable);

  const retryPolicy = retry(retryableFailures, {
    maxAttempts: retryAttempts,
    backoff: new ExponentialBackoff(),
  });

  // The breaker trips on any IntegrationError plus cockatiel's own timeout
  // (TaskCancelledError, thrown by the timeout() policy below) — unlike
  // retry, it's not limited to `retryable` errors,
  // since a hung downstream service should open the circuit even if its
  // errors aren't retried. It must NOT trip on a DomainError that represents
  // bad caller input (e.g. ValidationError for an invalid token/request) —
  // that's a fault of the specific call, not the downstream service, and
  // counting it would let a client tripping input errors take the circuit
  // down for everyone else.
  const circuitBreakerPolicy = circuitBreaker(
    handleWhen((err) => err instanceof IntegrationError || isTaskCancelledError(err)),
    {
      halfOpenAfter: circuitBreakerHalfOpenAfterMs,
      breaker: new ConsecutiveBreaker(circuitBreakerThreshold),
    },
  );

  if (env.TIMEOUTS_ENABLED) {
    return wrap(retryPolicy, circuitBreakerPolicy, timeout(timeoutMs, TimeoutStrategy.Aggressive));
  }

  return wrap(retryPolicy, circuitBreakerPolicy);
}

export { CircuitState } from 'cockatiel';
export type { CircuitBreakerPolicy } from 'cockatiel';
