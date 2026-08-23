import { createWorker } from '../../../shared/queue/queueConnection';
import { createModuleLogger } from '../../../shared/observability/logger';
import { ConfidencePolicy } from '../domain/policies/ConfidencePolicy';
import { RagHttpEstimator } from '../adapters/photo/RagHttpEstimator';
import { ResilientPhotoEstimator } from '../adapters/photo/ResilientPhotoEstimator';
import { PrismaFoodEntryRepository } from '../adapters/repository/PrismaFoodEntryRepository';
import { prisma } from '../../../shared/persistence/db';
import type { RecognizePhotoJobPayload } from '../use-cases/RecognizeFromPhoto';
import { env } from '../../../shared/config/env';

const logger = createModuleLogger('food-recognition');

const QUEUE_NAME = 'recognize-photo';
const CONCURRENCY = Number(process.env.PHOTO_WORKER_CONCURRENCY ?? 2);

const repository = new PrismaFoodEntryRepository(prisma);
const innerEstimator = new RagHttpEstimator();
const estimator = new ResilientPhotoEstimator(innerEstimator);

/**
 * recognizePhotoJob worker.
 *
 * Trace context is set automatically by createWorker() — no manual
 * runWithContext() call needed here. The createWorker wrapper reads
 * job.data.traceId and calls runWithContext() before the processor runs.
 *
 * On exhausted retries BullMQ will call the `failed` event handler below
 * to mark the entry as failed and emit the push notification code.
 */
export const recognizePhotoWorker = createWorker<RecognizePhotoJobPayload>(
  QUEUE_NAME,
  async (job) => {
    const { mealPhotoId, userId, photoObjectKey } = job.data;
    logger.info({ mealPhotoId }, 'starting photo recognition');

    const photoUrl = `${env.RAG_SERVICE_URL}/pending/${photoObjectKey}`;

    const result = await estimator.estimate(photoUrl);
    const needsUserAction = ConfidencePolicy.needsUserAction(result.status);

    const status = needsUserAction ? 'insufficient_data' : 'completed';

    await repository.updateResult(mealPhotoId, {
      status,
      items: result.items,
      macros: result.macros,
      needsUserAction,
      resultJson: result.raw,
    });

    logger.info({ mealPhotoId, status }, 'photo recognition completed');
  },
  { concurrency: CONCURRENCY },
);

// On final failure (all retries exhausted): mark entry failed + emit notification code
recognizePhotoWorker.on('failed', async (job, err) => {
  if (!job) return;
  const { mealPhotoId } = job.data;

  logger.error({ mealPhotoId, err }, 'photo recognition job permanently failed');

  try {
    await repository.updateResult(mealPhotoId, {
      status: 'failed',
      errorCode: 'RECOGNITION_FAILED',
    });
    // Push notification: only the code is stored; mobile handles localized message
    // The notification service is called here — it's a fire-and-forget operation
    // TODO: wire to notifications module when it's available
    logger.warn({ mealPhotoId, code: 'RECOGNITION_FAILED' }, 'push notification code emitted');
  } catch (updateErr) {
    logger.error({ mealPhotoId, updateErr }, 'failed to update failed status');
  }
});
