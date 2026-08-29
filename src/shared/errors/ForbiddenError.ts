import { DomainError } from './DomainError';

export class ForbiddenError extends DomainError {
  readonly httpStatus = 403;

  constructor(code: string, message: string) {
    super(code, message);
  }
}
