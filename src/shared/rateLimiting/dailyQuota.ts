import { cacheRedisClient } from '../cache/redisCacheClient';
import { env } from '../config/env';
import { RateLimitError } from '../errors/RateLimitError';
import { createModuleLogger } from '../observability/logger';

const logger = createModuleLogger('rate-limiting');

/**
 * Thrown when a free-tier user has spent their daily allowance for a feature.
 * Distinct from the sliding-window `RATE_LIMIT_EXCEEDED` (`checkRateLimit`) so
 * the mobile client can tell "you hit today's free limit → show upsell" apart
 * from "you're going too fast → back off".
 */
export const FREE_TIER_DAILY_LIMIT_CODE = 'FREE_TIER_DAILY_LIMIT';

export interface DailyQuotaStatus {
  used: number;
  /** null = unlimited (premium). */
  limit: number | null;
  /** null = unlimited (premium). */
  remaining: number | null;
  /** Start of the next UTC day — when the counter resets. */
  resetsAt: Date;
}

/**
 * Per-user, per-feature daily quota. Fixed window on the **UTC calendar day**:
 * the Redis key carries the date (`quota:<key>:<YYYY-MM-DD>`) and expires just
 * after the next UTC midnight, so a new day starts a fresh counter with no
 * separate reset job.
 *
 * The caller owns the key prefix (`photo:<userId>`, `chat:<userId>`, ...) — this
 * module knows nothing about features, only key/limit.
 *
 * Fails **open**: if Redis is unavailable the request is allowed. Blocking a
 * user because the counter store blipped is worse than handing out an extra
 * scan. Premium bypass is the caller's job — only call this for free users.
 */

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function redisKey(key: string, now: Date): string {
  return `quota:${key}:${utcDayKey(now)}`;
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

/**
 * TTL for a day's counter: time from `now` to just after the next UTC midnight,
 * as a RELATIVE duration. Must not be an absolute PEXPIREAT timestamp — with an
 * injected (e.g. backdated) `now` that timestamp can already be in the past,
 * which makes Redis drop the key immediately and the counter never accumulates.
 */
function counterTtlSeconds(reset: Date, now: Date): number {
  return secondsUntil(reset, now) + 60;
}

/**
 * Increments the caller's usage for today and throws `RateLimitError`
 * (`FREE_TIER_DAILY_LIMIT`) once it would exceed `limit`. A rejected call does
 * not consume the quota (the increment is rolled back).
 */
export async function consumeDailyQuota(
  key: string,
  limit: number,
  now: Date = new Date(),
): Promise<void> {
  if (!env.RATE_LIMIT_ENABLED) {
    return;
  }

  const rk = redisKey(key, now);
  const reset = nextUtcMidnight(now);

  let count: number;
  try {
    count = await cacheRedisClient.incr(rk);
    // Refresh the expiry on every hit — cheap, and defends against a key that
    // somehow lost its TTL from living forever. Relative TTL (not PEXPIREAT):
    // see counterTtlSeconds.
    await cacheRedisClient.expire(rk, counterTtlSeconds(reset, now));
  } catch (err) {
    logger.warn({ err, key }, 'daily quota check failed — allowing request (fail-open)');
    return;
  }

  if (count > limit) {
    try {
      await cacheRedisClient.decr(rk);
    } catch (err) {
      logger.warn({ err, key }, 'daily quota rollback failed');
    }
    logger.info({ key, limit }, 'daily free-tier quota exhausted');
    throw new RateLimitError(
      FREE_TIER_DAILY_LIMIT_CODE,
      `Daily free-tier limit reached for "${key}"`,
      secondsUntil(reset, now),
    );
  }
}

/**
 * Best-effort return of one consumed unit — for when the action the quota was
 * spent on turned out to be rejected downstream (e.g. an invalid photo that
 * never reached recognition).
 */
export async function refundDailyQuota(key: string, now: Date = new Date()): Promise<void> {
  if (!env.RATE_LIMIT_ENABLED) {
    return;
  }

  try {
    const rk = redisKey(key, now);
    const raw = await cacheRedisClient.get(rk);
    if (raw !== null && Number(raw) > 0) {
      await cacheRedisClient.decr(rk);
    }
  } catch (err) {
    logger.warn({ err, key }, 'daily quota refund failed');
  }
}

/** Read-only view of today's usage — never mutates the counter. */
export async function peekDailyQuota(
  key: string,
  limit: number,
  now: Date = new Date(),
): Promise<DailyQuotaStatus> {
  const reset = nextUtcMidnight(now);

  let used = 0;
  try {
    const raw = await cacheRedisClient.get(redisKey(key, now));
    used = raw ? Math.max(0, Number(raw)) : 0;
  } catch (err) {
    logger.warn({ err, key }, 'daily quota peek failed — reporting zero usage');
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: reset,
  };
}
