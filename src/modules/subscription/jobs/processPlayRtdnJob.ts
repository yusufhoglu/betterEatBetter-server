import { prisma } from '../../../shared/persistence/db';
import { createModuleLogger } from '../../../shared/observability/logger';
import { createWorker } from '../../../shared/queue/queueConnection';
import { GoogleReceiptAdapter } from '../adapters/billing/GoogleReceiptAdapter';
import { ResilientGoogleReceiptAdapter } from '../adapters/billing/ResilientGoogleReceiptAdapter';
import { PrismaSubscriptionRepository } from '../adapters/repository/PrismaSubscriptionRepository';
import type { PlayRtdnJobPayload } from '../use-cases/ProcessGooglePlayRtdn';

const logger = createModuleLogger('subscription');

const QUEUE_NAME = 'process-play-rtdn';

const repository = new PrismaSubscriptionRepository(prisma);
const validator = new ResilientGoogleReceiptAdapter(new GoogleReceiptAdapter());

/**
 * Reconciles one Google Play RTDN notification: looks up the subscription by
 * purchaseToken, then re-fetches fresh state from the Google Play Developer
 * API — the notification itself only signals "something changed", it's never
 * trusted as the source of truth for status/expiry.
 *
 * If no row is found the notification raced ahead of the client's own
 * POST /subscription/verify call — logged and dropped rather than retried
 * indefinitely; the client's next verify/entitlement call reconciles it.
 */
export const processPlayRtdnWorker = createWorker<PlayRtdnJobPayload>(QUEUE_NAME, async (job) => {
  const { purchaseToken } = job.data;

  const existing = await repository.findByPurchaseToken(purchaseToken);
  if (!existing) {
    logger.warn({ purchaseToken }, 'RTDN notification for unknown purchaseToken — dropping');
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

  logger.info({ purchaseToken, status: validated.status }, 'subscription reconciled from RTDN notification');
});

processPlayRtdnWorker.on('failed', (job, err) => {
  logger.error(
    { purchaseToken: job?.data.purchaseToken, jobId: job?.id, attemptsMade: job?.attemptsMade, err },
    'RTDN reconciliation job failed',
  );
});
