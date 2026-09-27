import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import { createModuleLogger } from '../../../shared/observability/logger';
import { runWithContext } from '../../../shared/observability/tracer';
import { createQueue, createWorker } from '../../../shared/queue/queueConnection';
import type { BaseJobPayload } from '../../../shared/queue/jobTypes';
import { registerRepeatableJob } from '../../../shared/scheduling/cronRunner';
import { buildInsightsService, practiceRepository, practiceToday } from '../http/practiceWiring';
import { RefreshAllInsights } from '../use-cases/RefreshAllInsights';

const logger = createModuleLogger('practice');
const QUEUE_NAME = 'practice-insights';
/** 02:30 Europe/Istanbul — after the day is over for the product's users. */
const NIGHTLY_PATTERN = '30 23 * * *';

export const practiceInsightsWorker = createWorker<BaseJobPayload>(
  QUEUE_NAME,
  () =>
    runWithContext({ traceId: randomUUID() }, async () => {
      const result = await new RefreshAllInsights(practiceRepository, buildInsightsService(), practiceToday).execute();
      logger.info({ result }, 'nightly client insights refreshed');
    }),
  { concurrency: 1 },
);

let queue: Queue<BaseJobPayload> | undefined;

/** Called from main.ts after listen(). Fixed jobId → one schedule however many instances run. */
export async function registerPracticeSchedules(): Promise<void> {
  queue ??= createQueue<BaseJobPayload>(QUEUE_NAME);
  await registerRepeatableJob(queue, {
    jobId: 'nightly-insights',
    pattern: NIGHTLY_PATTERN,
    payload: { traceId: randomUUID() },
  });
  logger.info('practice nightly insights registered');
}
