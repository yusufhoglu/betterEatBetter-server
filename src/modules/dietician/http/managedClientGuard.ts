import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import type { ManagedClientPort } from '../ports/ManagedClientPort';

/**
 * Clients with an active human dietitian don't get the AI coach — the two
 * would give conflicting advice (dietitian-platform-design.md §6). Must run
 * after authMiddleware. Chatbot / food recognition are unaffected.
 */
export function managedClientGuard(port: ManagedClientPort) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await port.isManagedClient(req.auth!.userId)) {
        next(
          new ForbiddenError(
            'AI_COACH_UNAVAILABLE_MANAGED_CLIENT',
            'The AI coach is not available while you work with a dietitian',
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
