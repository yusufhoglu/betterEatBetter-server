import { OAuth2Client } from 'google-auth-library';
import { env } from '../../../../shared/config/env';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { PushNotificationVerifierPort } from '../../ports/PushNotificationVerifierPort';

const logger = createModuleLogger('subscription');

const BEARER_PREFIX = 'Bearer ';

/**
 * Verifies Cloud Pub/Sub's push-authentication OIDC token (the
 * Authorization: Bearer header Pub/Sub attaches when the push subscription
 * is configured with a service account) — not a body-signature scheme like
 * Stripe/GitHub webhooks. verifyIdToken checks signature, issuer, expiry,
 * and audience against Google's public certs.
 */
export class GooglePubSubVerifier implements PushNotificationVerifierPort {
  private readonly client = new OAuth2Client();

  constructor(private readonly audience: string = env.GOOGLE_PLAY_RTDN_AUDIENCE) {}

  async verify(authorizationHeader: string | undefined): Promise<void> {
    if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
      throw new ValidationError('MISSING_BEARER_TOKEN', 'Missing Pub/Sub push authorization token');
    }

    const idToken = authorizationHeader.slice(BEARER_PREFIX.length);

    try {
      await this.client.verifyIdToken({ idToken, audience: this.audience });
    } catch (err) {
      logger.warn({ err }, 'Pub/Sub push token verification failed');
      throw new ValidationError('INVALID_PUSH_TOKEN', 'Pub/Sub push token verification failed');
    }
  }
}
