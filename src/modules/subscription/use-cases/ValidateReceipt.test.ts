import type { ReceiptValidatorPort } from '../ports/ReceiptValidatorPort';
import { ValidateReceipt } from './ValidateReceipt';

class FakeValidator implements ReceiptValidatorPort {
  constructor(private readonly label: string) {}

  async validate(input: { productId: string; receiptToken: string }) {
    return {
      productId: `${this.label}:${input.productId}`,
      status: 'active' as const,
      expiresAt: null,
      willRenew: true,
      inGracePeriod: false,
      linkedPurchaseToken: null,
    };
  }
}

describe('ValidateReceipt', () => {
  test('dispatches to the apple validator for provider "apple"', async () => {
    const validateReceipt = new ValidateReceipt(new FakeValidator('apple'), new FakeValidator('google'));

    const result = await validateReceipt.execute({
      provider: 'apple',
      productId: 'yearly',
      receiptToken: 'token',
    });

    expect(result.productId).toBe('apple:yearly');
  });

  test('dispatches to the google validator for provider "google"', async () => {
    const validateReceipt = new ValidateReceipt(new FakeValidator('apple'), new FakeValidator('google'));

    const result = await validateReceipt.execute({
      provider: 'google',
      productId: 'yearly',
      receiptToken: 'token',
    });

    expect(result.productId).toBe('google:yearly');
  });
});
