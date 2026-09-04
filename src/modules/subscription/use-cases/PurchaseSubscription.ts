import { ConflictError } from '../../../shared/errors/ConflictError';
import type { EntitlementCachePort } from '../ports/EntitlementCachePort';
import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';
import type { ValidateReceipt } from './ValidateReceipt';

export class PurchaseSubscription {
  constructor(
    private readonly validateReceipt: ValidateReceipt,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly entitlementCache: EntitlementCachePort,
  ) {}

  async execute(input: { userId: string; provider: 'apple' | 'google'; productId: string; receiptToken: string }) {
    // A purchaseToken already bound to a different user must be rejected —
    // otherwise reusing someone else's token would silently move their
    // entitlement (the DB's unique constraint on purchaseToken would only
    // catch this as an opaque 500, not the documented 409).
    const existing = await this.subscriptionRepository.findByPurchaseToken(input.receiptToken);
    if (existing && existing.userId !== input.userId) {
      throw new ConflictError('TOKEN_ALREADY_LINKED', 'This purchase token is already linked to another account');
    }

    const validated = await this.validateReceipt.execute({
      provider: input.provider,
      productId: input.productId,
      receiptToken: input.receiptToken,
    });

    const subscription = await this.subscriptionRepository.upsert({
      userId: input.userId,
      productId: validated.productId,
      provider: input.provider,
      status: validated.status,
      expiresAt: validated.expiresAt,
      purchaseToken: input.receiptToken,
      willRenew: validated.willRenew,
      inGracePeriod: validated.inGracePeriod,
    });

    // The entitlement just changed — drop the cached premium/free decision so
    // the freemium quota paths don't keep treating a fresh subscriber as free
    // until the cache TTL lapses.
    await this.entitlementCache.invalidate(input.userId);

    return subscription;
  }
}
