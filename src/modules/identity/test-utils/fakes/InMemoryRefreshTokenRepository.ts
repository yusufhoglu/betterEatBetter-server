import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../../../../shared/errors/UnauthorizedError';
import type {
  IssuedRefreshToken,
  RefreshTokenRepositoryPort,
  RotatedRefreshToken,
} from '../../ports/RefreshTokenRepositoryPort';

interface StoredToken {
  userId: string;
  status: 'active' | 'used' | 'revoked';
  expiresAt: Date;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Mirrors the exact rotation + reuse-detection flow from identity-rule.md, in memory. */
export class InMemoryRefreshTokenRepository implements RefreshTokenRepositoryPort {
  private readonly tokensByValue = new Map<string, StoredToken>();

  async issue(userId: string): Promise<IssuedRefreshToken> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    this.tokensByValue.set(token, { userId, status: 'active', expiresAt });
    return { token, expiresAt };
  }

  async rotate(presentedToken: string): Promise<RotatedRefreshToken> {
    const existing = this.tokensByValue.get(presentedToken);

    if (!existing) {
      throw new UnauthorizedError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid');
    }

    if (existing.status !== 'active') {
      for (const stored of this.tokensByValue.values()) {
        if (stored.userId === existing.userId) {
          stored.status = 'revoked';
        }
      }
      throw new UnauthorizedError('REFRESH_TOKEN_REUSE_DETECTED', 'Refresh token reuse detected');
    }

    existing.status = 'used';
    const next = await this.issue(existing.userId);

    return { userId: existing.userId, refreshToken: next };
  }

  statusOf(token: string): 'active' | 'used' | 'revoked' | undefined {
    return this.tokensByValue.get(token)?.status;
  }
}
