import { DomainError } from './DomainError';

/**
 * Wraps a failure from a third-party integration (Python RAG, LLM, barcode
 * API, ...). `retryable` tells the caller (typically a job worker) whether a
 * retry is worth attempting — createWorker() translates a non-retryable
 * IntegrationError into a BullMQ UnrecoverableError automatically.
 */
export class IntegrationError extends DomainError {
  readonly httpStatus: 502 | 503;

  constructor(
    code: string,
    message: string,
    readonly retryable: boolean,
    httpStatus: 502 | 503 = 502,
    /**
     * Seconds the caller should wait before retrying — surfaced as a
     * `Retry-After` header by the error mapper. Set for provider throttling
     * (HTTP 429) when the upstream tells us how long to back off.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(code, message);
    this.httpStatus = httpStatus;
  }

  /**
   * Whether this failure should count toward a circuit breaker. A provider
   * throttle (429) or our own local overload means "slow down", not "the
   * upstream is broken" — tripping the breaker on those turns a throttle into
   * a full outage, so they opt out.
   */
  get circuitImpacting(): boolean {
    return this.code !== 'LLM_RATE_LIMITED' && this.code !== 'LLM_OVERLOADED';
  }
}
