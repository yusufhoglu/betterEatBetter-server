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
  ) {
    super(code, message);
    this.httpStatus = httpStatus;
  }
}
