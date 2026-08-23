import { issueInitialRefreshToken, rotateRefreshToken } from '../../../../shared/auth/refreshTokenService';
import type {
  IssuedRefreshToken,
  RefreshTokenRepositoryPort,
  RotatedRefreshToken,
} from '../../ports/RefreshTokenRepositoryPort';

/**
 * Delegates to shared/auth/refreshTokenService.ts instead of re-implementing
 * rotation + reuse detection against Prisma here. That logic is security
 * critical and already covers this exact flow (not found -> Unauthorized,
 * already-used -> revoke all + Unauthorized, active -> rotate); a second,
 * independent implementation in this module would risk the two drifting apart.
 */
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  async issue(userId: string): Promise<IssuedRefreshToken> {
    const issued = await issueInitialRefreshToken(userId);
    return { token: issued.token, expiresAt: issued.expiresAt };
  }

  async rotate(presentedToken: string): Promise<RotatedRefreshToken> {
    const rotated = await rotateRefreshToken(presentedToken);
    return {
      userId: rotated.userId,
      refreshToken: {
        token: rotated.refreshToken.token,
        expiresAt: rotated.refreshToken.expiresAt,
      },
    };
  }
}
