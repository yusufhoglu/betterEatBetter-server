import { signAccessToken, verifyAccessToken } from '../../../../shared/auth/jwt';
import type { AccessTokenPayload, SessionTokenPort } from '../../ports/SessionTokenPort';

/**
 * Delegates to shared/auth/jwt.ts rather than signing/verifying independently
 * here — authMiddleware verifies access tokens through that same module, so a
 * separate implementation here could mint tokens authMiddleware won't accept.
 */
export class JwtSessionTokenAdapter implements SessionTokenPort {
  signAccessToken(userId: string): string {
    return signAccessToken(userId);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return verifyAccessToken(token);
  }
}
