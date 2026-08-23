import { DomainError } from './DomainError';

export class UnauthorizedError extends DomainError {
  readonly httpStatus = 401;

  constructor(code: string, message: string) {
    super(code, message);
  }
}
