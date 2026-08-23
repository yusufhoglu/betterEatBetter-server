import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors/UnauthorizedError';
import { setUserId } from '../observability/tracer';
import type { AuthContext } from './AuthContext';
import { verifyAccessToken } from './jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

/** Verifies the access token and writes AuthContext onto the request — controllers never parse JWTs themselves. */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;

  if (!token) {
    next(new UnauthorizedError('MISSING_ACCESS_TOKEN', 'Access token is required'));
    return;
  }

  try {
    const { userId } = verifyAccessToken(token);
    req.auth = { userId };
    setUserId(userId);
    next();
  } catch (err) {
    next(err);
  }
}
