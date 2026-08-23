import { DomainError } from './DomainError';

export class ValidationError extends DomainError {
  readonly httpStatus = 400;

  constructor(code: string, message: string) {
    super(code, message);
  }
}
