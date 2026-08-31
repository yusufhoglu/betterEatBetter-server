import { ConflictError } from '../../../shared/errors/ConflictError';
import type { ReceiptValidatorPort } from '../ports/ReceiptValidatorPort';
import type { SubscriptionRecord, SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';
import { PurchaseSubscription } from './PurchaseSubscription';
import { ValidateReceipt } from './ValidateReceipt';

class FakeReceiptValidator implements ReceiptValidatorPort {
  async validate(input: { productId: string; receiptToken: string }) {
    return {
      productId: input.productId,
      status: 'active' as const,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      willRenew: true,
      inGracePeriod: false,
    };
  }
}

class FakeSubscriptionRepository implements SubscriptionRepositoryPort {
  byPurchaseToken = new Map<string, SubscriptionRecord>();
  upserted: Array<Parameters<SubscriptionRepositoryPort['upsert']>[0]> = [];

  async findLatestByUserId(): Promise<SubscriptionRecord | null> {
    return null;
  }

  async findByPurchaseToken(purchaseToken: string): Promise<SubscriptionRecord | null> {
    return this.byPurchaseToken.get(purchaseToken) ?? null;
  }

  async upsert(input: Parameters<SubscriptionRepositoryPort['upsert']>[0]): Promise<SubscriptionRecord> {
    this.upserted.push(input);
    return {
      id: 'sub-1',
      userId: input.userId,
      productId: input.productId,
      provider: input.provider,
      status: input.status,
      expiresAt: input.expiresAt,
      purchaseToken: input.purchaseToken,
      willRenew: input.willRenew,
      inGracePeriod: input.inGracePeriod,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

describe('PurchaseSubscription', () => {
  test('validates the receipt then persists the purchaseToken alongside the resulting state', async () => {
    const repository = new FakeSubscriptionRepository();
    const validateReceipt = new ValidateReceipt(new FakeReceiptValidator(), new FakeReceiptValidator());
    const purchaseSubscription = new PurchaseSubscription(validateReceipt, repository);

    const result = await purchaseSubscription.execute({
      userId: 'user-1',
      provider: 'google',
      productId: 'premium_yearly',
      receiptToken: 'google-purchase-token',
    });

    expect(result.status).toBe('active');
    expect(repository.upserted).toEqual([
      {
        userId: 'user-1',
        productId: 'premium_yearly',
        provider: 'google',
        status: 'active',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        purchaseToken: 'google-purchase-token',
        willRenew: true,
        inGracePeriod: false,
      },
    ]);
  });

  test('rejects with 409 TOKEN_ALREADY_LINKED when the purchaseToken already belongs to another user', async () => {
    const repository = new FakeSubscriptionRepository();
    repository.byPurchaseToken.set('shared-token', {
      id: 'sub-existing',
      userId: 'other-user',
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: null,
      purchaseToken: 'shared-token',
      willRenew: true,
      inGracePeriod: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const validateReceipt = new ValidateReceipt(new FakeReceiptValidator(), new FakeReceiptValidator());
    const purchaseSubscription = new PurchaseSubscription(validateReceipt, repository);

    await expect(
      purchaseSubscription.execute({
        userId: 'user-1',
        provider: 'google',
        productId: 'premium_yearly',
        receiptToken: 'shared-token',
      }),
    ).rejects.toThrow(ConflictError);
    expect(repository.upserted).toHaveLength(0);
  });

  test('allows re-verifying a purchaseToken already linked to the same user', async () => {
    const repository = new FakeSubscriptionRepository();
    repository.byPurchaseToken.set('own-token', {
      id: 'sub-existing',
      userId: 'user-1',
      productId: 'premium_yearly',
      provider: 'google',
      status: 'active',
      expiresAt: null,
      purchaseToken: 'own-token',
      willRenew: true,
      inGracePeriod: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const validateReceipt = new ValidateReceipt(new FakeReceiptValidator(), new FakeReceiptValidator());
    const purchaseSubscription = new PurchaseSubscription(validateReceipt, repository);

    await expect(
      purchaseSubscription.execute({
        userId: 'user-1',
        provider: 'google',
        productId: 'premium_yearly',
        receiptToken: 'own-token',
      }),
    ).resolves.toBeDefined();
  });
});
