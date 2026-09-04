import { createModuleLogger } from '../../../shared/observability/logger';
import type { EntitlementCachePort } from '../ports/EntitlementCachePort';
import { premiumEntitlementCacheKey } from './PremiumStatusCache';

const logger = createModuleLogger('subscription');

/** The slice of an ioredis client this invalidator needs. */
export interface EntitlementCacheDeleteStore {
  del(key: string): Promise<unknown>;
}

/**
 * Deletes the cached premium/free entry so the next quota / rate-limiter check
 * re-reads it from the subscription table. Best-effort: a failed delete just
 * means the stale entry lingers until its short TTL expires, and the
 * `GET /subscription/entitlement` endpoint reads the DB directly regardless —
 * so this never throws.
 */
export class RedisEntitlementCache implements EntitlementCachePort {
  constructor(private readonly store: EntitlementCacheDeleteStore) {}

  async invalidate(userId: string): Promise<void> {
    try {
      await this.store.del(premiumEntitlementCacheKey(userId));
    } catch (err) {
      logger.warn({ err, userId }, 'failed to invalidate cached premium entitlement');
    }
  }
}
