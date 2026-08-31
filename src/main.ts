// TODO: tum modulleri wiring eder, sunucuyu baslatir
import './modules/food-recognition/jobs/recognizePhotoJob';
import './modules/food-recognition/jobs/standardizeAndCopyJob';
import './modules/subscription/jobs/processPlayRtdnJob';
import express from 'express';
import { PrismaMealLogReadModelRepository } from './modules/body-analytics/adapters/repository/PrismaMealLogReadModelRepository';
import { ConsumeOutboxEventsJob } from './modules/body-analytics/jobs/consumeOutboxEventsJob';
import { CleanupOrphanedFoodEntriesJob } from './modules/food-recognition/jobs/CleanupOrphanedFoodEntriesJob';
import { createRouter } from './http/router';
import { env } from './shared/config/env';
import { errorMapperMiddleware } from './shared/errors/errorMapper';
import { logger } from './shared/observability/logger';
import { requestLoggingMiddleware } from './shared/observability/requestLoggingMiddleware';
import { canonicalizeFoodPhotoTraceMiddleware, tracingMiddleware } from './shared/observability/tracingMiddleware';
import { prisma } from './shared/persistence/db';

const app = express();
const analyticsOutboxPollingIntervalMs = 15_000;
const foodEntryCleanupIntervalMs = env.FOOD_ENTRY_CLEANUP_INTERVAL_MS;

function startAnalyticsOutboxPolling(): void {
  const job = new ConsumeOutboxEventsJob(prisma, new PrismaMealLogReadModelRepository(prisma));
  let isRunning = false;

  const poll = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      const processed = await job.execute();
      if (processed > 0) {
        logger.info({ processed }, 'analytics outbox events processed');
      }
    } catch (error) {
      logger.error({ err: error }, 'analytics outbox polling failed');
    } finally {
      isRunning = false;
    }
  };

  void poll();
  setInterval(() => {
    void poll();
  }, analyticsOutboxPollingIntervalMs).unref();
}

function startFoodEntryCleanupPolling(): void {
  const job = new CleanupOrphanedFoodEntriesJob(prisma);
  let isRunning = false;

  const poll = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      const deleted = await job.execute();
      if (deleted > 0) {
        logger.info({ deleted }, 'orphaned food entries cleaned up');
      }
    } catch (error) {
      logger.error({ err: error }, 'food entry cleanup polling failed');
    } finally {
      isRunning = false;
    }
  };

  void poll();
  setInterval(() => {
    void poll();
  }, foodEntryCleanupIntervalMs).unref();
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-trace-id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(tracingMiddleware);
app.use(express.json());
app.use(canonicalizeFoodPhotoTraceMiddleware);
app.use(requestLoggingMiddleware);
app.use(createRouter());
app.use(errorMapperMiddleware);

const port = Number(process.env.PORT ?? 3000);
startAnalyticsOutboxPolling();
startFoodEntryCleanupPolling();

app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, 'server started');
});

