import { DomainError } from './DomainError';

export class RateLimitError extends DomainError {
  readonly httpStatus = 429;

  constructor(
    code: string,
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(code, message);
  }
}
