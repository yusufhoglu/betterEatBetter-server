import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { getTraceId } from '../../../shared/observability/tracer';
import { createQueue } from '../../../shared/queue/queueConnection';
import type { BaseJobPayload } from '../../../shared/queue/jobTypes';
import type { PushNotificationVerifierPort } from '../ports/PushNotificationVerifierPort';

const logger = createModuleLogger('subscription');

export interface PlayRtdnJobPayload extends BaseJobPayload {
  purchaseToken: string;
}

export const playRtdnQueue = createQueue<PlayRtdnJobPayload>('process-play-rtdn');

// https://developer.android.com/google/play/billing/rtdn-reference — push
// endpoint envelope wraps a base64 DeveloperNotification in message.data.
const pushEnvelopeSchema = z.object({
  message: z.object({
    messageId: z.string(),
    data: z.string(),
  }),
});

const developerNotificationSchema = z.object({
  packageName: z.string(),
  subscriptionNotification: z
    .object({
      purchaseToken: z.string(),
      subscriptionId: z.string(),
      notificationType: z.number(),
    })
    .optional(),
});

/**
 * Verifies and parses one Cloud Pub/Sub push delivery for Google Play RTDN,
 * then hands it to the process-play-rtdn queue for the actual entitlement
 * reconciliation (see jobs/processPlayRtdnJob.ts) — this stays fast so the
 * push endpoint can ack quickly, since Pub/Sub retries on any non-2xx.
 */
export class ProcessGooglePlayRtdn {
  constructor(private readonly verifier: PushNotificationVerifierPort) {}

  async execute(input: { authorizationHeader: string | undefined; rawBody: unknown }): Promise<void> {
    await this.verifier.verify(input.authorizationHeader);

    const envelope = pushEnvelopeSchema.safeParse(input.rawBody);
    if (!envelope.success) {
      throw new ValidationError('INVALID_PUSH_ENVELOPE', 'Malformed Pub/Sub push envelope');
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(envelope.data.message.data, 'base64').toString('utf8'));
    } catch {
      throw new ValidationError('INVALID_PUSH_PAYLOAD', 'Pub/Sub message.data was not valid base64 JSON');
    }

    const notification = developerNotificationSchema.safeParse(decoded);
    if (!notification.success) {
      throw new ValidationError('INVALID_PUSH_PAYLOAD', 'Developer notification did not match expected schema');
    }

    const { subscriptionNotification } = notification.data;
    if (!subscriptionNotification) {
      // Test pings from Play Console ("Send test notification") and
      // one-time-product notifications land here too — nothing to reconcile.
      logger.info({ packageName: notification.data.packageName }, 'ignoring non-subscription RTDN notification');
      return;
    }

    await playRtdnQueue.add(
      'process-play-rtdn',
      {
        purchaseToken: subscriptionNotification.purchaseToken,
        traceId: getTraceId() ?? envelope.data.message.messageId,
      },
      { jobId: envelope.data.message.messageId },
    );
  }
}
