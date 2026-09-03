import type { NextFunction, Request, Response } from 'express';
import { env } from '../../../shared/config/env';
import { consumeDailyQuota } from '../../../shared/rateLimiting/dailyQuota';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';

const WINDOW_SECONDS = 60;

/**
 * Every chat message must pass all of:
 *
 *  1. `chat:user:<id>` — sliding-window burst limit. Stops a single user (or a
 *     runaway client loop) from spamming the LLM within a minute.
 *  2. `chat:global:<tier>` — a system-wide ceiling on chat→LLM traffic, split
 *     into separate `free` and `premium` buckets so a burst of free users can
 *     never exhaust the budget premium users depend on.
 *  3. `chat:<id>` daily quota (free users only) — `FREE_DAILY_CHAT_LIMIT`
 *     messages per UTC day. This is the free-tier product limit; premium users
 *     skip it. Rejection carries the `FREE_TIER_DAILY_LIMIT` code so the app
 *     shows an upgrade prompt rather than a "slow down" message.
 *
 * `req.isPremium` is set upstream by `premiumContextMiddleware`; absent it, the
 * request is treated as free. Must run after authMiddleware.
 */
export function chatRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.auth!.userId;
  const isPremium = req.isPremium === true;

  const globalKey = isPremium ? 'chat:global:premium' : 'chat:global:free';
  const globalLimit = isPremium
    ? env.CHAT_RATE_LIMIT_GLOBAL_PREMIUM
    : env.CHAT_RATE_LIMIT_GLOBAL_FREE;

  const checks = [
    checkRateLimit(`chat:user:${userId}`, env.CHAT_RATE_LIMIT_PER_USER, WINDOW_SECONDS),
    checkRateLimit(globalKey, globalLimit, WINDOW_SECONDS),
  ];

  if (!isPremium) {
    checks.push(consumeDailyQuota(`chat:${userId}`, env.FREE_DAILY_CHAT_LIMIT));
  }

  Promise.all(checks)
    .then(() => next())
    .catch(next);
}
