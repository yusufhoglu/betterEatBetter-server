/**
 * Lets the purchase + RTDN-reconcile paths drop a user's cached premium/free
 * decision the moment their entitlement changes, so the freemium quota / rate
 * limiter paths (which read `PremiumStatusCache`) don't keep serving a stale
 * "free" for the cache TTL right after someone pays.
 *
 * The read side lives in `entitlement/PremiumStatusCache.ts`; this is the
 * write-invalidation side, kept as a port so use-cases don't import ioredis.
 */
export interface EntitlementCachePort {
  invalidate(userId: string): Promise<void>;
}
