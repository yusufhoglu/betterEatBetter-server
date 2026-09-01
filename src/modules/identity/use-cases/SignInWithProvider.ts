import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { UserSession } from '../domain/UserSession';
import type { IdentityProviderPort, SocialIdTokenCredentials } from '../ports/IdentityProviderPort';
import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';
import type { SessionTokenPort } from '../ports/SessionTokenPort';
import type { UserRepositoryPort } from '../ports/UserRepositoryPort';

const logger = createModuleLogger('identity-social');

export type SocialProviderName = 'google' | 'apple';

export interface SignInWithProviderInput {
  provider: string;
  idToken: string;
}

/**
 * Social sign-in (Google today, Apple later). Kept separate from SignIn: the
 * provider has already verified the user, so a find-or-create path is safe
 * here — unlike email+password, where it would blur the credential check
 * (identity-rule.md).
 *
 * Account linking is automatic: if the provider's verified email already
 * belongs to an email+password account, the provider identity is attached to
 * that existing user rather than creating a duplicate. This is only safe
 * because the adapter guarantees the email is provider-verified.
 */
export class SignInWithProvider {
  constructor(
    private readonly providers: Partial<Record<SocialProviderName, IdentityProviderPort<SocialIdTokenCredentials>>>,
    private readonly userRepository: UserRepositoryPort,
    private readonly sessionTokenPort: SessionTokenPort,
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
  ) {}

  async execute(input: SignInWithProviderInput): Promise<UserSession> {
    const adapter = this.providers[input.provider as SocialProviderName];
    if (!adapter) {
      throw new ValidationError('UNSUPPORTED_PROVIDER', `Unsupported sign-in provider: ${input.provider}`);
    }

    const identity = await adapter.verify({ idToken: input.idToken });

    let user = await this.userRepository.findByGoogleSub(identity.externalId);

    if (!user) {
      const byEmail = await this.userRepository.findByEmail(identity.email);
      if (byEmail) {
        user = await this.userRepository.linkGoogleAccount(byEmail.id, identity.externalId);
        logger.info({ userId: user.id, provider: input.provider }, 'linked social identity to existing account');
      } else {
        user = await this.userRepository.create({ email: identity.email, googleSub: identity.externalId });
        logger.info({ userId: user.id, provider: input.provider }, 'created account from social sign-in');
      }
    }

    const accessToken = this.sessionTokenPort.signAccessToken(user.id);
    const refreshToken = await this.refreshTokenRepository.issue(user.id);

    return {
      userId: user.id,
      accessToken,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
