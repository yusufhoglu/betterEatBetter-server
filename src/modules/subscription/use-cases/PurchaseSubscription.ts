import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';
import type { ValidateReceipt } from './ValidateReceipt';

export class PurchaseSubscription {
  constructor(
    private readonly validateReceipt: ValidateReceipt,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
  ) {}

  async execute(input: {
    userId: string;
    provider: 'apple' | 'google';
    productId: string;
    receiptToken: string;
    expiresAt?: Date | null;
  }) {
    const validated = await this.validateReceipt.execute({
      provider: input.provider,
      productId: input.productId,
      receiptToken: input.receiptToken,
      expiresAt: input.expiresAt,
    });

    return this.subscriptionRepository.upsert({
      userId: input.userId,
      productId: validated.productId,
      provider: input.provider,
      status: validated.status,
      expiresAt: validated.expiresAt,
    });
  }
}
