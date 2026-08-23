import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import type { UserSession } from '../domain/UserSession';
import type { EmailPasswordCredentials, IdentityProviderPort } from '../ports/IdentityProviderPort';
import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';
import type { SessionTokenPort } from '../ports/SessionTokenPort';

export interface SignInInput {
  email: string;
  password: string;
}

const SIGN_IN_RATE_LIMIT = 5;
const SIGN_IN_RATE_LIMIT_WINDOW_SECONDS = 300;

/**
 * Email+password sign-in. Rate limit is checked before anything else — even
 * before the password comparison — so a locked-out caller never triggers an
 * argon2 hash (identity-rule.md). "email not found" and "wrong password" are
 * indistinguishable here by construction: IdentityProviderPort#verify throws
 * the same INVALID_CREDENTIALS error for both.
 */
export class SignIn {
  constructor(
    private readonly identityProvider: IdentityProviderPort<EmailPasswordCredentials>,
    private readonly sessionTokenPort: SessionTokenPort,
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
  ) {}

  async execute(input: SignInInput): Promise<UserSession> {
    await checkRateLimit(`signin:${input.email}`, SIGN_IN_RATE_LIMIT, SIGN_IN_RATE_LIMIT_WINDOW_SECONDS);

    const identity = await this.identityProvider.verify(input);

    const accessToken = this.sessionTokenPort.signAccessToken(identity.externalId);
    const refreshToken = await this.refreshTokenRepository.issue(identity.externalId);

    return {
      userId: identity.externalId,
      accessToken,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
