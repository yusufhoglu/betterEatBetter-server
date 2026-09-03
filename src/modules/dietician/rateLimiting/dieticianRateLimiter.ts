import type { NextFunction, Request, Response } from 'express';
import { env } from '../../../shared/config/env';
import { consumeDailyQuota } from '../../../shared/rateLimiting/dailyQuota';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';

const WINDOW_SECONDS = 60;

/**
 * Same three-check shape as `chatRateLimiter`, on its own `dietician:*` buckets
 * and a much tighter free daily quota — every advice turn spends a prime-model
 * completion.
 *
 *  1. `dietician:user:<id>` — per-user burst.
 *  2. `dietician:global:<tier>` — system ceiling, split free / premium.
 *  3. `dietician:<id>` daily quota — free users only, `FREE_DAILY_DIETICIAN_LIMIT`
 *     turns per UTC day; rejection carries `FREE_TIER_DAILY_LIMIT` for the upsell.
 *
 * Must run after `authMiddleware` and `premiumContextMiddleware`.
 */
export function dieticianRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.auth!.userId;
  const isPremium = req.isPremium === true;

  const globalKey = isPremium ? 'dietician:global:premium' : 'dietician:global:free';
  const globalLimit = isPremium
    ? env.DIETICIAN_RATE_LIMIT_GLOBAL_PREMIUM
    : env.DIETICIAN_RATE_LIMIT_GLOBAL_FREE;

  const checks = [
    checkRateLimit(`dietician:user:${userId}`, env.DIETICIAN_RATE_LIMIT_PER_USER, WINDOW_SECONDS),
    checkRateLimit(globalKey, globalLimit, WINDOW_SECONDS),
  ];

  if (!isPremium) {
    checks.push(consumeDailyQuota(`dietician:${userId}`, env.FREE_DAILY_DIETICIAN_LIMIT));
  }

  Promise.all(checks)
    .then(() => next())
    .catch(next);
}
