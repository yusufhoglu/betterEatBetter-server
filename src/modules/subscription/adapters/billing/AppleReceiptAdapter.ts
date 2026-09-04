import { ValidationError } from '../../../../shared/errors/ValidationError';
import type { ReceiptValidatorPort } from '../../ports/ReceiptValidatorPort';

export class AppleReceiptAdapter implements ReceiptValidatorPort {
  async validate(input: {
    productId: string;
    receiptToken: string;
  }): Promise<{
    productId: string;
    status: 'active' | 'canceled';
    expiresAt: Date | null;
    willRenew: boolean;
    inGracePeriod: boolean;
    linkedPurchaseToken: string | null;
  }> {
    if (!input.receiptToken.startsWith('apple:')) {
      throw new ValidationError('INVALID_TOKEN', 'Apple receipt token is invalid');
    }

    return {
      productId: input.productId,
      status: 'active',
      expiresAt: null,
      willRenew: true,
      inGracePeriod: false,
      linkedPurchaseToken: null,
    };
  }
}
