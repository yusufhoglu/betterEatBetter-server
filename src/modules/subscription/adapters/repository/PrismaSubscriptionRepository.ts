import type { SubscriptionRecord, SubscriptionRepositoryPort } from '../../ports/SubscriptionRepositoryPort';

interface SubscriptionDb {
  subscription: {
    findFirst(args: unknown): Promise<SubscriptionRecord | null>;
    create(args: unknown): Promise<SubscriptionRecord>;
    update(args: unknown): Promise<SubscriptionRecord>;
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly db: SubscriptionDb) {}

  async findLatestByUserId(userId: string) {
    return this.db.subscription.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findByPurchaseToken(purchaseToken: string) {
    return this.db.subscription.findFirst({ where: { purchaseToken } });
  }

  async upsert(input: {
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
    purchaseToken: string | null;
    willRenew: boolean;
    inGracePeriod: boolean;
  }) {
    const existing = await this.db.subscription.findFirst({
      where: {
        userId: input.userId,
        productId: input.productId,
        provider: input.provider,
      },
    });

    if (!existing) {
      return this.db.subscription.create({ data: input });
    }

    return this.db.subscription.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        expiresAt: input.expiresAt,
        purchaseToken: input.purchaseToken,
        willRenew: input.willRenew,
        inGracePeriod: input.inGracePeriod,
      },
    });
  }
}
