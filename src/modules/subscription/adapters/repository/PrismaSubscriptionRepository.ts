import { createModuleLogger } from '../../../../shared/observability/logger';
import type { SubscriptionRecord, SubscriptionRepositoryPort } from '../../ports/SubscriptionRepositoryPort';

const logger = createModuleLogger('subscription');

// A row a newer (linked) purchase has superseded — see `supersede()` below.
// Never entitled: DetermineEntitlement only treats 'active'/'trialing' as
// premium, so this needs no special-casing anywhere else.
const SUPERSEDED_STATUS = 'superseded';

interface SubscriptionDb {
  subscription: {
    findFirst(args: unknown): Promise<SubscriptionRecord | null>;
    findMany(args: unknown): Promise<SubscriptionRecord[]>;
    create(args: unknown): Promise<SubscriptionRecord>;
    update(args: unknown): Promise<SubscriptionRecord>;
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly db: SubscriptionDb) {}

  // A user can end up with more than one row (upsert is keyed by
  // userId+productId+provider, so switching products — monthly to yearly,
  // say — creates a second row rather than reusing the first). Picking
  // "most recently updated" would then misfire the moment the OLD row gets
  // touched again later (a delayed RTDN for it, or supersede() itself) —
  // it'd look "latest" while being the stale, non-entitled plan. So: among
  // currently-entitled rows, prefer the most recently updated; only fall
  // back to recency across all rows when none are entitled (so a lapsed
  // user's last-known state is still what's returned).
  async findLatestByUserId(userId: string) {
    const subscriptions = await this.db.subscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) {
      return null;
    }

    const now = Date.now();
    const entitled = subscriptions.filter(
      (s) => ['active', 'trialing'].includes(s.status) && (s.expiresAt === null || s.expiresAt.getTime() > now),
    );

    const pool = entitled.length > 0 ? entitled : subscriptions;
    return pool.reduce((latest, candidate) => (candidate.updatedAt.getTime() > latest.updatedAt.getTime() ? candidate : latest));
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

  async supersede(input: { purchaseToken: string; expectedUserId: string }): Promise<void> {
    try {
      const existing = await this.db.subscription.findFirst({ where: { purchaseToken: input.purchaseToken } });
      if (!existing || existing.userId !== input.expectedUserId || existing.status === SUPERSEDED_STATUS) {
        return;
      }

      await this.db.subscription.update({
        where: { id: existing.id },
        data: { status: SUPERSEDED_STATUS, willRenew: false },
      });
    } catch (err) {
      logger.warn({ err, purchaseToken: input.purchaseToken }, 'failed to supersede linked purchaseToken');
    }
  }
}
