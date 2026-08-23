export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: IssuedRefreshToken;
}

/**
 * Owns refresh-token rotation + reuse detection (identity-rule.md). `issue`
 * mints a brand-new token for a fresh session (sign-up/sign-in); `rotate`
 * consumes a presented token and either returns a new one or throws — a
 * previously-used token throws too, but only after revoking every other
 * active token for that user (reuse detection).
 */
export interface RefreshTokenRepositoryPort {
  issue(userId: string): Promise<IssuedRefreshToken>;
  rotate(presentedToken: string): Promise<RotatedRefreshToken>;
}
