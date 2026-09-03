import type { NextFunction, Request, Response } from 'express';
import { setPremium } from '../../../shared/observability/tracer';
import type { PremiumStatusCache } from './PremiumStatusCache';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      isPremium?: boolean;
    }
  }
}

/**
 * Resolves the caller's premium entitlement (cached) and records it on both the
 * request and the trace context. Downstream:
 *  - `chatRateLimiter` picks the free/premium global bucket and applies the
 *    free-tier daily chat quota from `req.isPremium`;
 *  - `FoodRecognitionController.handlePhoto` applies the free-tier daily photo
 *    quota from `req.isPremium`;
 *  - the LLM concurrency gate reads the trace context to route premium calls
 *    into its priority lane.
 *
 * Must run after `authMiddleware`. Never blocks: a failed lookup resolves to
 * free.
 */
export function premiumContextMiddleware(cache: PremiumStatusCache) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.auth?.userId;
    if (!userId) {
      next();
      return;
    }

    cache
      .isPremium(userId)
      .then((isPremium) => {
        req.isPremium = isPremium;
        setPremium(isPremium);
      })
      .catch(() => {
        req.isPremium = false;
      })
      .finally(() => next());
  };
}
