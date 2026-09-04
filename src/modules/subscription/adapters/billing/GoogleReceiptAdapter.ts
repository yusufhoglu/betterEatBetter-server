import { JWT } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../../../../shared/config/env';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { MapGooglePlayState } from '../../domain/MapGooglePlayState';
import type { ReceiptValidatorPort } from '../../ports/ReceiptValidatorPort';

const logger = createModuleLogger('subscription');

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

// Errors here use the codes documented in subscription-backend-contract.md
// (INVALID_TOKEN / PLAY_API_ERROR) so the mobile client can switch on them.
const INVALID_TOKEN_CODE = 'INVALID_TOKEN';
const PLAY_API_ERROR_CODE = 'PLAY_API_ERROR';

const subscriptionPurchaseSchema = z.object({
  subscriptionState: z.string(),
  // ACKNOWLEDGEMENT_STATE_PENDING until either side acknowledges. Google
  // auto-refunds a purchase left unacknowledged for 3 days, so we acknowledge
  // server-side here rather than relying solely on the client's
  // completePurchase() (see subscription-backend-contract.md step 4).
  acknowledgementState: z.string().optional(),
  // Set by Google when this purchase resulted from an upgrade/downgrade or
  // resubscribe of a prior subscription — points at the purchaseToken it
  // supersedes. Absent for a first-time purchase.
  linkedPurchaseToken: z.string().optional(),
  lineItems: z
    .array(
      z.object({
        productId: z.string().optional(),
        expiryTime: z.string().optional(),
        autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }).optional(),
      }),
    )
    .default([]),
});

const ACKNOWLEDGEMENT_STATE_PENDING = 'ACKNOWLEDGEMENT_STATE_PENDING' as const;

/**
 * Real Google Play Developer API integration — replaces the old
 * receiptToken.startsWith('google:') stub. `receiptToken` here is the Play
 * Billing purchaseToken the mobile client got back from a purchase.
 *
 * Uses the subscriptionsv2.get endpoint (Google's current recommendation
 * over the legacy purchases.subscriptions.get) since it reports a single
 * subscriptionState covering grace period / hold / pause, rather than
 * requiring the caller to reconstruct that from separate fields.
 */
export class GoogleReceiptAdapter implements ReceiptValidatorPort {
  private readonly jwtClient: JWT;

  constructor(
    private readonly packageName: string = env.GOOGLE_PLAY_PACKAGE_NAME,
    serviceAccountJson: string = env.GOOGLE_SERVICE_ACCOUNT_JSON,
  ) {
    const credentials = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
    this.jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });
  }

  async validate(input: {
    // Optional so RTDN reconciliation can look up a purchaseToken it has
    // never seen before (e.g. an out-of-app plan switch) without already
    // knowing which product it belongs to — see processPlayRtdnJob.ts. The
    // client-driven purchase flow (ValidateReceipt/PurchaseSubscription)
    // always passes it, so the cross-check below still applies there.
    productId?: string;
    receiptToken: string;
  }): Promise<{
    productId: string;
    status: 'active' | 'canceled';
    expiresAt: Date | null;
    willRenew: boolean;
    inGracePeriod: boolean;
    linkedPurchaseToken: string | null;
  }> {
    const purchaseToken = input.receiptToken;

    let accessToken: string | null | undefined;
    try {
      ({ token: accessToken } = await this.jwtClient.getAccessToken());
    } catch (err) {
      logger.error({ err }, 'failed to obtain Google Play access token');
      throw new IntegrationError(PLAY_API_ERROR_CODE, 'Could not authenticate with Google Play', true);
    }

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      logger.error({ err }, 'Google Play Developer API network error');
      throw new IntegrationError(PLAY_API_ERROR_CODE, 'Could not reach Google Play Developer API', true);
    }

    if (response.status === 400 || response.status === 404) {
      throw new ValidationError(INVALID_TOKEN_CODE, 'Google Play purchase token is invalid or unknown');
    }

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;
      throw new IntegrationError(PLAY_API_ERROR_CODE, `Google Play Developer API returned ${response.status}`, retryable);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new IntegrationError(PLAY_API_ERROR_CODE, 'Google Play API returned non-JSON body', false);
    }

    const parsed = subscriptionPurchaseSchema.safeParse(body);
    if (!parsed.success) {
      logger.error({ errors: parsed.error.issues }, 'Google Play subscriptionsv2 response schema mismatch');
      throw new IntegrationError(PLAY_API_ERROR_CODE, 'Google Play API response did not match expected schema', false);
    }

    const mapped = MapGooglePlayState(parsed.data);

    // mapped.productId is null when Google's response carries no line items
    // (nothing to cross-check against); input.productId is undefined when the
    // caller doesn't know it yet (RTDN reconciling an unfamiliar token) —
    // either way there's nothing to compare. Otherwise it must match what the
    // client claims, so a purchaseToken for one product can't be used to
    // claim entitlement to a different (e.g. pricier) one.
    if (input.productId !== undefined && mapped.productId !== null && mapped.productId !== input.productId) {
      throw new ValidationError(INVALID_TOKEN_CODE, 'purchaseToken does not match the given productId');
    }

    const resolvedProductId = mapped.productId ?? input.productId ?? null;
    if (resolvedProductId === null) {
      throw new IntegrationError(PLAY_API_ERROR_CODE, 'Google Play API response had no productId to resolve', false);
    }

    // Acknowledge server-side while the purchase is still entitled and pending
    // acknowledgement. Best-effort: a failure here never fails verification —
    // the client's completePurchase() and the RTDN reconcile path both retry
    // this, and Google's 3-day window is generous.
    if (mapped.status === 'active' && parsed.data.acknowledgementState === ACKNOWLEDGEMENT_STATE_PENDING) {
      await this.acknowledge(resolvedProductId, purchaseToken, accessToken);
    }

    return {
      productId: resolvedProductId,
      status: mapped.status,
      expiresAt: mapped.expiresAt,
      willRenew: mapped.willRenew,
      inGracePeriod: mapped.inGracePeriod,
      linkedPurchaseToken: parsed.data.linkedPurchaseToken ?? null,
    };
  }

  /**
   * POST purchases.subscriptions.acknowledge (the v1 endpoint — subscriptionsv2
   * has no acknowledge of its own). Swallows every failure: if Google raced the
   * client's acknowledgement we'd get a 400 here, and any transient error is
   * covered by the client ack + RTDN reconcile. Never throws.
   */
  private async acknowledge(
    productId: string,
    purchaseToken: string,
    accessToken: string | null | undefined,
  ): Promise<void> {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!response.ok) {
        logger.warn({ status: response.status, productId }, 'Google Play acknowledge returned non-2xx — leaving to client/RTDN');
        return;
      }

      logger.info({ productId }, 'acknowledged Google Play purchase server-side');
    } catch (err) {
      logger.warn({ err, productId }, 'Google Play acknowledge request failed — leaving to client/RTDN');
    }
  }
}
