import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors/UnauthorizedError';

export interface AccessTokenPayload {
  userId: string;
}

/** Stateless: signature check only, never hits the DB. Short-lived by design (15-30min). */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
      throw new Error('malformed access token payload');
    }
    return { userId: decoded.sub };
  } catch {
    throw new UnauthorizedError('ACCESS_TOKEN_INVALID', 'Access token is invalid or expired');
  }
}
