import type { NextFunction, Request, Response } from 'express';
import { env } from '../../../shared/config/env';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';

const WINDOW_SECONDS = 60;

/**
 * Two independent limits per chat message, both must pass:
 *
 *  1. `chat:user:<id>` — stops any single user (or a runaway client loop)
 *     from spamming the LLM. Sized per-user.
 *  2. `chat:global:<tier>` — a system-wide ceiling on chat→LLM traffic, split
 *     into separate `free` and `premium` buckets so a burst of free users can
 *     never exhaust the budget premium users depend on. The per-user limit is
 *     blind to aggregate load; this is not.
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

  Promise.all([
    checkRateLimit(`chat:user:${userId}`, env.CHAT_RATE_LIMIT_PER_USER, WINDOW_SECONDS),
    checkRateLimit(globalKey, globalLimit, WINDOW_SECONDS),
  ])
    .then(() => next())
    .catch(next);
}
