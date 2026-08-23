import type { AccessTokenPayload, SessionTokenPort } from '../../ports/SessionTokenPort';

/** Deterministic access "token" — avoids pulling in real JWT signing for use-case tests. */
export class FakeSessionTokenPort implements SessionTokenPort {
  signAccessToken(userId: string): string {
    return `access-token:${userId}`;
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [, userId] = token.split(':');
    return { userId: userId ?? '' };
  }
}
