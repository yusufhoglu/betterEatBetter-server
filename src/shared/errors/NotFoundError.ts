import { DomainError } from './DomainError';

export class NotFoundError extends DomainError {
  readonly httpStatus = 404;

  constructor(code: string, message: string) {
    super(code, message);
  }
}
