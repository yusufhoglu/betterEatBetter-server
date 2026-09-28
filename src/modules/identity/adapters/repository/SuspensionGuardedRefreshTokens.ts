import { ForbiddenError } from '../../../../shared/errors/ForbiddenError';
import type { IssuedRefreshToken, RefreshTokenRepositoryPort, RotatedRefreshToken } from '../../ports/RefreshTokenRepositoryPort';

export const ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED';

/**
 * Every session starts with `issue` (sign-up, sign-in, social sign-in) and is
 * kept alive by `rotate`, so checking suspension here covers all entry points
 * without touching each use-case. Suspension also revokes existing refresh
 * tokens (admin module), so an already-open session ends when its access
 * token expires (JWT_ACCESS_TOKEN_TTL_SECONDS).
 */
export class SuspensionGuardedRefreshTokens implements RefreshTokenRepositoryPort {
  constructor(
    private readonly inner: RefreshTokenRepositoryPort,
    private readonly isSuspended: (userId: string) => Promise<boolean>,
  ) {}

  async issue(userId: string): Promise<IssuedRefreshToken> {
    await this.assertActive(userId);
    return this.inner.issue(userId);
  }

  async rotate(presentedToken: string): Promise<RotatedRefreshToken> {
    const rotated = await this.inner.rotate(presentedToken);
    if (await this.isSuspended(rotated.userId)) {
      await this.inner.revokeAllForUser(rotated.userId);
      throw suspended();
    }
    return rotated;
  }

  revoke(presentedToken: string): Promise<void> {
    return this.inner.revoke(presentedToken);
  }

  revokeAllForUser(userId: string): Promise<void> {
    return this.inner.revokeAllForUser(userId);
  }

  private async assertActive(userId: string): Promise<void> {
    if (await this.isSuspended(userId)) {
      throw suspended();
    }
  }
}

function suspended(): ForbiddenError {
  return new ForbiddenError(ACCOUNT_SUSPENDED, 'This account has been suspended');
}
