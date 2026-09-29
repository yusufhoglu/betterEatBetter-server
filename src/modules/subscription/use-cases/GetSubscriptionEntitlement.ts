import { DetermineEntitlement } from '../domain/DetermineEntitlement';
import type { SponsoredPremiumPort } from '../ports/SponsoredPremiumPort';
import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';

/** Where premium comes from: a store subscription, or the user's dietitian. */
export type EntitlementSource = 'subscription' | 'dietitian';

export interface EntitlementDetails {
  isPremium: boolean;
  /** null when not premium. */
  source: EntitlementSource | null;
  productId: string | null;
  expiresAt: Date | null;
  willRenew: boolean;
  inGracePeriod: boolean;
}

const FREE: EntitlementDetails = {
  isPremium: false,
  source: null,
  productId: null,
  expiresAt: null,
  willRenew: false,
  inGracePeriod: false,
};

export class GetSubscriptionEntitlement {
  constructor(
    private readonly repository: SubscriptionRepositoryPort,
    /** Omitted → only store subscriptions count (tests, scripts). */
    private readonly sponsor?: SponsoredPremiumPort,
  ) {}

  // Kept boolean-only — modules/me's MeController depends on this exact
  // signature for its isPremium field. describe() below is for callers that
  // need the full mobile-facing Entitlement shape (see SubscriptionController).
  async execute(userId: string, now: Date = new Date()): Promise<boolean> {
    if (await this.hasActiveSubscription(userId, now)) {
      return true;
    }
    return this.isSponsored(userId);
  }

  async describe(userId: string, now: Date = new Date()): Promise<EntitlementDetails> {
    const subscription = await this.repository.findLatestByUserId(userId);
    const paid =
      subscription !== null &&
      DetermineEntitlement({ status: subscription.status, expiresAt: subscription.expiresAt, now });

    if (paid) {
      return {
        isPremium: true,
        source: 'subscription',
        productId: subscription.productId,
        expiresAt: subscription.expiresAt,
        willRenew: subscription.willRenew,
        inGracePeriod: subscription.inGracePeriod,
      };
    }
    if (await this.isSponsored(userId)) {
      // No store details: the dietitian relationship, not Play, keeps it alive.
      return { ...FREE, isPremium: true, source: 'dietitian' };
    }
    if (!subscription) {
      return FREE;
    }
    // Lapsed subscription: still report its details (renewal state, expiry).
    return {
      ...FREE,
      productId: subscription.productId,
      expiresAt: subscription.expiresAt,
      willRenew: subscription.willRenew,
      inGracePeriod: subscription.inGracePeriod,
    };
  }

  private async hasActiveSubscription(userId: string, now: Date): Promise<boolean> {
    const subscription = await this.repository.findLatestByUserId(userId);
    return (
      subscription !== null &&
      DetermineEntitlement({ status: subscription.status, expiresAt: subscription.expiresAt, now })
    );
  }

  private isSponsored(userId: string): Promise<boolean> {
    return this.sponsor ? this.sponsor.isSponsored(userId) : Promise.resolve(false);
  }
}
