import type { SubscriptionRepositoryPort } from '../../ports/SubscriptionRepositoryPort';

interface SubscriptionDb {
  subscription: {
    findFirst(args: unknown): Promise<{
      id: string;
      userId: string;
      productId: string;
      provider: string;
      status: string;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
    create(args: unknown): Promise<{
      id: string;
      userId: string;
      productId: string;
      provider: string;
      status: string;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    update(args: unknown): Promise<{
      id: string;
      userId: string;
      productId: string;
      provider: string;
      status: string;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
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

  async upsert(input: {
    userId: string;
    productId: string;
    provider: string;
    status: string;
    expiresAt: Date | null;
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
      },
    });
  }
}
