import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../persistence/db';
import { env } from '../config/env';
import { UnauthorizedError } from '../errors/UnauthorizedError';

const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export interface IssuedRefreshToken {
  id: string;
  token: string;
  expiresAt: Date;
}

async function issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const record = await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  return { id: record.id, token, expiresAt };
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: IssuedRefreshToken;
}

/**
 * Issues a fresh refresh token for a newly authenticated session (sign-in).
 * Not a rotation — there is no prior token to invalidate.
 */
export async function issueInitialRefreshToken(userId: string): Promise<IssuedRefreshToken> {
  return issueRefreshToken(userId);
}

/**
 * Rotation + reuse detection. The presented token is always invalidated as
 * part of a successful rotation. If it was already revoked, that's a signal
 * the token was stolen and reused — every active refresh token for that user
 * is revoked immediately.
 */
export async function rotateRefreshToken(presentedToken: string): Promise<RotatedRefreshToken> {
  const tokenHash = hashToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new UnauthorizedError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
  }

  if (existing.revokedAt) {
    await revokeAllRefreshTokens(existing.userId);
    throw new UnauthorizedError('REFRESH_TOKEN_REUSE_DETECTED', 'Refresh token reuse detected');
  }

  if (existing.expiresAt < new Date()) {
    throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
  }

  const next = await issueRefreshToken(existing.userId);

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedById: next.id },
  });

  return { userId: existing.userId, refreshToken: next };
}
