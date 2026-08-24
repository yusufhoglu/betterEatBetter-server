import { ValidationError } from '../../../shared/errors/ValidationError';
import type { ReceiptValidatorPort } from '../ports/ReceiptValidatorPort';

export class ValidateReceipt {
  constructor(
    private readonly appleValidator: ReceiptValidatorPort,
    private readonly googleValidator: ReceiptValidatorPort,
  ) {}

  async execute(input: {
    provider: 'apple' | 'google';
    productId: string;
    receiptToken: string;
    expiresAt?: Date | null;
  }) {
    if (input.provider === 'apple') {
      return this.appleValidator.validate(input);
    }

    if (input.provider === 'google') {
      return this.googleValidator.validate(input);
    }

    throw new ValidationError('INVALID_PROVIDER', 'Unsupported subscription provider');
  }
}
