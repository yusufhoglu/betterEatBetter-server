import { DetermineEntitlement } from '../domain/DetermineEntitlement';
import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';

export interface EntitlementDetails {
  isPremium: boolean;
  productId: string | null;
  expiresAt: Date | null;
  willRenew: boolean;
  inGracePeriod: boolean;
}

export class GetSubscriptionEntitlement {
  constructor(private readonly repository: SubscriptionRepositoryPort) {}

  // Kept boolean-only — modules/me's MeController depends on this exact
  // signature for its isPremium field. describe() below is for callers that
  // need the full mobile-facing Entitlement shape (see SubscriptionController).
  async execute(userId: string, now: Date = new Date()): Promise<boolean> {
    const subscription = await this.repository.findLatestByUserId(userId);
    if (!subscription) {
      return false;
    }

    return DetermineEntitlement({
      status: subscription.status,
      expiresAt: subscription.expiresAt,
      now,
    });
  }

  async describe(userId: string, now: Date = new Date()): Promise<EntitlementDetails> {
    const subscription = await this.repository.findLatestByUserId(userId);
    if (!subscription) {
      return { isPremium: false, productId: null, expiresAt: null, willRenew: false, inGracePeriod: false };
    }

    return {
      isPremium: DetermineEntitlement({ status: subscription.status, expiresAt: subscription.expiresAt, now }),
      productId: subscription.productId,
      expiresAt: subscription.expiresAt,
      willRenew: subscription.willRenew,
      inGracePeriod: subscription.inGracePeriod,
    };
  }
}
