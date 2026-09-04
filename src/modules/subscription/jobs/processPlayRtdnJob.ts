import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { prisma } from '../../../shared/persistence/db';
import { createModuleLogger } from '../../../shared/observability/logger';
import { createWorker } from '../../../shared/queue/queueConnection';
import { GoogleReceiptAdapter } from '../adapters/billing/GoogleReceiptAdapter';
import { ResilientGoogleReceiptAdapter } from '../adapters/billing/ResilientGoogleReceiptAdapter';
import { PrismaSubscriptionRepository } from '../adapters/repository/PrismaSubscriptionRepository';
import { RedisEntitlementCache } from '../entitlement/RedisEntitlementCache';
import type { PlayRtdnJobPayload } from '../use-cases/ProcessGooglePlayRtdn';

const logger = createModuleLogger('subscription');

const QUEUE_NAME = 'process-play-rtdn';

const repository = new PrismaSubscriptionRepository(prisma);
const validator = new ResilientGoogleReceiptAdapter(new GoogleReceiptAdapter());
const entitlementCache = new RedisEntitlementCache(cacheRedisClient);

/**
 * Reconciles one Google Play RTDN notification: looks up the subscription by
 * purchaseToken, then re-fetches fresh state from the Google Play Developer
 * API — the notification itself only signals "something changed", it's never
 * trusted as the source of truth for status/expiry.
 *
 * A purchaseToken can also be one we've never seen: Play lets a user change
 * plans (e.g. monthly -> yearly) from the Play Store app itself, outside our
 * UI, which mints a brand-new token the client never calls /verify with.
 * Google's response for that new token carries `linkedPurchaseToken` pointing
 * at the old one — if we recognize that, bind the new row to the same user
 * and supersede the old row. If we don't recognize it either, the
 * notification genuinely raced ahead of anything we know about — logged and
 * dropped rather than retried indefinitely; the client's next verify/
 * entitlement call reconciles it.
 */
export const processPlayRtdnWorker = createWorker<PlayRtdnJobPayload>(QUEUE_NAME, async (job) => {
  const { purchaseToken } = job.data;

  const existing = await repository.findByPurchaseToken(purchaseToken);

  if (!existing) {
    await reconcileUnknownToken(purchaseToken);
    return;
  }

  const validated = await validator.validate({ productId: existing.productId, receiptToken: purchaseToken });

  await repository.upsert({
    userId: existing.userId,
    productId: validated.productId,
    provider: existing.provider,
    status: validated.status,
    expiresAt: validated.expiresAt,
    purchaseToken,
    willRenew: validated.willRenew,
    inGracePeriod: validated.inGracePeriod,
  });

  if (validated.linkedPurchaseToken) {
    await repository.supersede({ purchaseToken: validated.linkedPurchaseToken, expectedUserId: existing.userId });
  }

  // Renewals, cancellations, refunds and payment failures all land here — bust
  // the cached premium/free decision so the freemium quota paths pick up the
  // new state on the next request instead of waiting out the cache TTL.
  await entitlementCache.invalidate(existing.userId);

  logger.info({ purchaseToken, status: validated.status }, 'subscription reconciled from RTDN notification');
});

async function reconcileUnknownToken(purchaseToken: string): Promise<void> {
  let validated: Awaited<ReturnType<typeof validator.validate>>;
  try {
    validated = await validator.validate({ receiptToken: purchaseToken });
  } catch (err) {
    logger.warn({ purchaseToken, err }, 'RTDN notification for unknown purchaseToken — lookup failed, dropping');
    return;
  }

  if (!validated.linkedPurchaseToken) {
    logger.warn({ purchaseToken }, 'RTDN notification for unknown purchaseToken with no linkedPurchaseToken — dropping');
    return;
  }

  const linked = await repository.findByPurchaseToken(validated.linkedPurchaseToken);
  if (!linked) {
    logger.warn(
      { purchaseToken, linkedPurchaseToken: validated.linkedPurchaseToken },
      'RTDN linkedPurchaseToken not recognized either — dropping',
    );
    return;
  }

  await repository.upsert({
    userId: linked.userId,
    productId: validated.productId,
    provider: linked.provider,
    status: validated.status,
    expiresAt: validated.expiresAt,
    purchaseToken,
    willRenew: validated.willRenew,
    inGracePeriod: validated.inGracePeriod,
  });

  await repository.supersede({ purchaseToken: validated.linkedPurchaseToken, expectedUserId: linked.userId });
  await entitlementCache.invalidate(linked.userId);

  logger.info(
    { purchaseToken, linkedPurchaseToken: validated.linkedPurchaseToken, userId: linked.userId },
    'subscription reconciled from RTDN via linkedPurchaseToken (out-of-app plan change)',
  );
}

processPlayRtdnWorker.on('failed', (job, err) => {
  logger.error(
    { purchaseToken: job?.data.purchaseToken, jobId: job?.id, attemptsMade: job?.attemptsMade, err },
    'RTDN reconciliation job failed',
  );
});
