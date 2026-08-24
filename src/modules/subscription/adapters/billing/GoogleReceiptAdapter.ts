import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { ReceiptValidatorPort } from '../../ports/ReceiptValidatorPort';

export class GoogleReceiptAdapter implements ReceiptValidatorPort {
  async validate(input: {
    productId: string;
    receiptToken: string;
    expiresAt?: Date | null;
  }): Promise<{
    productId: string;
    status: 'active' | 'trialing' | 'canceled';
    expiresAt: Date | null;
  }> {
    if (!input.receiptToken.startsWith('google:')) {
      throw new ValidationError('INVALID_RECEIPT', 'Google receipt token is invalid');
    }

    return {
      productId: input.productId,
      status: 'active',
      expiresAt: input.expiresAt ?? null,
    };
  }
}
