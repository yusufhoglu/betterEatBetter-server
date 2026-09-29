import type { NextFunction, Request, Response } from 'express';
import { coachUnavailableError } from '../domain/coachAccessErrors';
import type { CoachAccessPort } from '../ports/CoachAccessPort';

/**
 * A dietitian's client reaches the AI coach only when the dietitian opened
 * their AI assistant to them (dietitian-platform-design.md §6, §13).
 * `send` also needs the assistant's hours to be open; `read` (history,
 * confirming an earlier meal card) works outside hours. Must run after
 * authMiddleware. Chatbot / food recognition are unaffected.
 */
export function coachAccessGuard(port: CoachAccessPort, mode: 'send' | 'read') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const access = await port.checkAccess(req.auth!.userId);
      if (access.kind === 'unavailable' && (access.reason === 'disabled' || mode === 'send')) {
        next(coachUnavailableError(access.reason));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
