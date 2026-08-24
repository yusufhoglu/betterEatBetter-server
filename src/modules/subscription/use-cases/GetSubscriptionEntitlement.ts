import { DetermineEntitlement } from '../domain/DetermineEntitlement';
import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';

export class GetSubscriptionEntitlement {
  constructor(private readonly repository: SubscriptionRepositoryPort) {}

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
}
