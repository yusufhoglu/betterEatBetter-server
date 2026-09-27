import type { Queue } from 'bullmq';
import { env } from '../../../shared/config/env';
import { createModuleLogger } from '../../../shared/observability/logger';
import { getTraceId } from '../../../shared/observability/tracer';
import { prisma } from '../../../shared/persistence/db';
import { createQueue, createWorker } from '../../../shared/queue/queueConnection';
import type { BaseJobPayload } from '../../../shared/queue/jobTypes';
import { PrismaDeviceTokenRepository } from '../../notifications/adapters/repository/PrismaDeviceTokenRepository';
import { FcmPushAdapter } from '../../notifications/adapters/push/FcmPushAdapter';
import { SendPushToUser } from '../../notifications/use-cases/SendPushToUser';
import { NotificationsChatPushAdapter } from '../adapters/push/NotificationsChatPushAdapter';
import { PrismaPeopleDirectory } from '../adapters/repository/PrismaPeopleDirectory';
import { PrismaThreadRepository } from '../adapters/repository/PrismaThreadRepository';
import type { UnreadPushSchedulerPort } from '../ports/UnreadPushSchedulerPort';
import { SendUnreadMessagePush } from '../use-cases/SendUnreadMessagePush';

const logger = createModuleLogger('messaging');
const QUEUE_NAME = 'messaging-unread-push';
/** Long enough that a recipient with the chat open reads it first; short enough to feel live. */
const PUSH_DELAY_MS = 20_000;

interface UnreadPushPayload extends BaseJobPayload {
  messageId: string;
  recipientId: string;
}

let queue: Queue<UnreadPushPayload> | undefined;

function getQueue(): Queue<UnreadPushPayload> {
  queue ??= createQueue<UnreadPushPayload>(QUEUE_NAME, {
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 1000, removeOnFail: 1000 },
  });
  return queue;
}

export class BullmqUnreadPushScheduler implements UnreadPushSchedulerPort {
  async schedule(input: { messageId: string; recipientId: string }): Promise<void> {
    if (!env.NOTIFICATIONS_ENABLED) {
      return;
    }
    await getQueue().add(
      'unread-push',
      { ...input, traceId: getTraceId() ?? input.messageId },
      // Deterministic: a duplicate schedule for the same message+recipient is a no-op.
      { jobId: `chat-push:${input.messageId}:${input.recipientId}`, delay: PUSH_DELAY_MS },
    );
  }
}

export const unreadMessagePushWorker = env.NOTIFICATIONS_ENABLED
  ? (() => {
      const useCase = new SendUnreadMessagePush(
        new PrismaThreadRepository(prisma),
        new PrismaPeopleDirectory(prisma),
        new NotificationsChatPushAdapter(new SendPushToUser(new PrismaDeviceTokenRepository(prisma), new FcmPushAdapter())),
      );
      return createWorker<UnreadPushPayload>(
        QUEUE_NAME,
        async (job) => {
          const outcome = await useCase.execute({ messageId: job.data.messageId, recipientId: job.data.recipientId });
          logger.debug({ messageId: job.data.messageId, outcome }, 'unread chat push processed');
        },
        { concurrency: 5 },
      );
    })()
  : undefined;
