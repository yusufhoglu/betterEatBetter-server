import type { NextFunction, Request, Response } from 'express';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';

const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_SECONDS = 60;

/** LLM calls are costly — limits chat messages per user per minute. Must run after authMiddleware. */
export function chatRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  checkRateLimit(`chat:${req.auth!.userId}`, DEFAULT_LIMIT, DEFAULT_WINDOW_SECONDS)
    .then(() => next())
    .catch(next);
}
