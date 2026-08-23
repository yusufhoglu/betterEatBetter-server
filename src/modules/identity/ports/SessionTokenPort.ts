export interface AccessTokenPayload {
  userId: string;
}

export interface SessionTokenPort {
  signAccessToken(userId: string): string;
  verifyAccessToken(token: string): AccessTokenPayload;
}
