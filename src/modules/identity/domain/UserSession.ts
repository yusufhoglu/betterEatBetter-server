/** Result of a successful sign-up, sign-in, or refresh — what the HTTP layer returns to the client. */
export interface UserSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
