import { OAuth2Client } from 'google-auth-library';
import { env } from '../../../../shared/config/env';
import { UnauthorizedError } from '../../../../shared/errors/UnauthorizedError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type {
  IdentityProviderPort,
  SocialIdTokenCredentials,
  VerifiedIdentity,
} from '../../ports/IdentityProviderPort';

const logger = createModuleLogger('identity-google');

/**
 * Verifies a Google OIDC ID token offline against Google's public keys
 * (google-auth-library caches the certs). `verifyIdToken` checks the
 * signature, issuer, expiry and audience; we additionally require a verified
 * email, since SignInWithProvider links by email and an unverified address
 * would let a caller claim someone else's account.
 *
 * A single throw path (`GOOGLE_TOKEN_INVALID`) for every failure mode keeps
 * the endpoint from leaking why a token was rejected.
 */
export class GoogleSignInAdapter implements IdentityProviderPort<SocialIdTokenCredentials> {
  constructor(
    private readonly client: OAuth2Client = new OAuth2Client(),
    private readonly allowedAudiences: string[] = env.GOOGLE_OAUTH_CLIENT_IDS,
  ) {}

  async verify(credentials: SocialIdTokenCredentials): Promise<VerifiedIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credentials.idToken,
        audience: this.allowedAudiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      logger.warn({ err }, 'Google ID token verification failed');
      throw new UnauthorizedError('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      logger.warn({ hasSub: Boolean(payload?.sub), emailVerified: payload?.email_verified }, 'Google ID token missing a verified email');
      throw new UnauthorizedError('GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
    }

    return { externalId: payload.sub, email: payload.email };
  }
}
