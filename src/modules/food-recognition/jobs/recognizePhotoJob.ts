import { createWorker } from '../../../shared/queue/queueConnection';
import { createModuleLogger } from '../../../shared/observability/logger';
import { ConfidencePolicy } from '../domain/policies/ConfidencePolicy';
import type { MacroSummary } from '../domain/FoodEntry';
import { RagHttpEstimator } from '../adapters/photo/RagHttpEstimator';
import { ResilientPhotoEstimator } from '../adapters/photo/ResilientPhotoEstimator';
import { PrismaFoodEntryRepository } from '../adapters/repository/PrismaFoodEntryRepository';
import { prisma } from '../../../shared/persistence/db';
import type { RecognizePhotoJobPayload } from '../use-cases/RecognizeFromPhoto';
import { createPendingDownloadUrl } from '../../../shared/storage/presignedUrl';

const logger = createModuleLogger('food-recognition');

const QUEUE_NAME = 'recognize-photo';
const CONCURRENCY = Number(process.env.PHOTO_WORKER_CONCURRENCY ?? 2);

const repository = new PrismaFoodEntryRepository(prisma);
const innerEstimator = new RagHttpEstimator();
const estimator = new ResilientPhotoEstimator(innerEstimator);

function summarizeMacros(
  items: Array<{
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  }>,
): MacroSummary {
  return items.reduce<MacroSummary>(
    (totals, item) => ({
      totalCalories: totals.totalCalories + item.calories,
      totalProteinGrams: totals.totalProteinGrams + item.proteinGrams,
      totalCarbsGrams: totals.totalCarbsGrams + item.carbsGrams,
      totalFatGrams: totals.totalFatGrams + item.fatGrams,
    }),
    {
      totalCalories: 0,
      totalProteinGrams: 0,
      totalCarbsGrams: 0,
      totalFatGrams: 0,
    },
  );
}

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
    const { mealPhotoId, userId } = job.data;
    logger.info({ mealPhotoId }, 'starting photo recognition');

    const photoUrl = await createPendingDownloadUrl(mealPhotoId);

    const result = await estimator.estimate(photoUrl);
    const needsUserAction = ConfidencePolicy.needsUserAction(result.status);
    const macros = summarizeMacros(result.items);
    const status = needsUserAction ? 'insufficient_data' : 'completed';

    await repository.updateResult(mealPhotoId, {
      status,
      items: result.items,
      macros,
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

  logger.error(
    { mealPhotoId, jobId: job.id, failedReason: job.failedReason, attemptsMade: job.attemptsMade, err },
    'photo recognition job permanently failed',
  );

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
