import type { UserSession } from '../domain/UserSession';
import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';
import type { SessionTokenPort } from '../ports/SessionTokenPort';

/**
 * Rotation + reuse detection lives in RefreshTokenRepositoryPort#rotate
 * (identity-rule.md's full flow) — this use-case just adds the fresh access
 * token on top of whatever refresh token comes back.
 */
export class RefreshSession {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
    private readonly sessionTokenPort: SessionTokenPort,
  ) {}

  async execute(refreshToken: string): Promise<UserSession> {
    const rotated = await this.refreshTokenRepository.rotate(refreshToken);
    const accessToken = this.sessionTokenPort.signAccessToken(rotated.userId);

    return {
      userId: rotated.userId,
      accessToken,
      refreshToken: rotated.refreshToken.token,
      refreshTokenExpiresAt: rotated.refreshToken.expiresAt,
    };
  }
}
