import { createModuleLogger } from '../../../shared/observability/logger';

const logger = createModuleLogger('subscription');

/** The slice of `GetSubscriptionEntitlement` this cache needs. */
export interface EntitlementSource {
  execute(userId: string, now?: Date): Promise<boolean>;
}

/** The slice of an ioredis client this cache needs. */
export interface EntitlementCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/** Redis key holding one user's cached premium/free entitlement. */
export function premiumEntitlementCacheKey(userId: string): string {
  return `entitlement:premium:${userId}`;
}

/**
 * Caches each user's premium/free entitlement for a short TTL so hot paths that
 * check it on every request (chat rate limiter + priority routing, the
 * free-tier daily quotas on chat and photo) don't do a subscription-table read
 * every time.
 *
 * Fail-open to `false`: if the cache or the subscription store is unavailable,
 * the user is treated as free — a momentary loss of priority, never a blocked
 * request.
 */
export class PremiumStatusCache {
  constructor(
    private readonly source: EntitlementSource,
    private readonly store: EntitlementCacheStore,
    private readonly ttlSeconds: number,
  ) {}

  async isPremium(userId: string): Promise<boolean> {
    const key = premiumEntitlementCacheKey(userId);

    try {
      const cached = await this.store.get(key);
      if (cached !== null) {
        return cached === '1';
      }
    } catch (err) {
      logger.warn({ err, userId }, 'entitlement cache read failed, falling through to source');
    }

    let premium = false;
    try {
      premium = await this.source.execute(userId);
    } catch (err) {
      logger.warn({ err, userId }, 'entitlement lookup failed, treating user as free');
      return false;
    }

    try {
      await this.store.set(key, premium ? '1' : '0', 'EX', this.ttlSeconds);
    } catch (err) {
      logger.warn({ err, userId }, 'entitlement cache write failed');
    }

    return premium;
  }
}
