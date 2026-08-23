import { DomainError } from './DomainError';

export class ConflictError extends DomainError {
  readonly httpStatus = 409;

  constructor(code: string, message: string) {
    super(code, message);
  }
}
