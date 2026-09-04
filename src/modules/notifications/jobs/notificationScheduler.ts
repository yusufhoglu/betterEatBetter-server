import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import { GetMealAverages } from '../../body-analytics/use-cases/GetMealAverages';
import { PrismaMealLogReadModelRepository } from '../../body-analytics/adapters/repository/PrismaMealLogReadModelRepository';
import { NutritionLoggingDayLogsAdapter } from '../../daily-tracking/adapters/dayLogs/NutritionLoggingDayLogsAdapter';
import { GetTodayStatus } from '../../daily-tracking/use-cases/GetTodayStatus';
import { GetWeekProgress } from '../../daily-tracking/use-cases/GetWeekProgress';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { GetLoggedMealTypesForDateRange } from '../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { PrismaMePreferencesRepository } from '../../me/adapters/repository/PrismaMePreferencesRepository';
import { env } from '../../../shared/config/env';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { createModuleLogger } from '../../../shared/observability/logger';
import { prisma } from '../../../shared/persistence/db';
import { createQueue, createWorker } from '../../../shared/queue/queueConnection';
import type { BaseJobPayload } from '../../../shared/queue/jobTypes';
import { registerRepeatableJob } from '../../../shared/scheduling/cronRunner';
import { runWithContext } from '../../../shared/observability/tracer';
import { MeNotificationPreferencesAdapter } from '../adapters/preferences/MeNotificationPreferencesAdapter';
import { FcmPushAdapter } from '../adapters/push/FcmPushAdapter';
import { PrismaDeviceTokenRepository } from '../adapters/repository/PrismaDeviceTokenRepository';
import { WeeklySummaryAdapter } from '../adapters/summary/WeeklySummaryAdapter';
import { DailyTrackingCompletionAdapter } from '../adapters/tracking/DailyTrackingCompletionAdapter';
import { SendPushToUser } from '../use-cases/SendPushToUser';
import { MealReminderJob } from './MealReminderScheduler';
import { MemoizingSendGuard, RedisSendGuard } from './SendGuard';
import { StreakSaverAlertJob } from './StreakSaverAlertJob';
import { WeeklyReportJob } from './WeeklyReportJob';

const logger = createModuleLogger('notifications');

const QUEUE_NAME = 'notifications-scheduled';

type ScheduledJobName = 'meal-reminders' | 'streak-saver' | 'weekly-report';

const SCHEDULES: ReadonlyArray<{ name: ScheduledJobName; pattern: string }> = [
  // Must match MealReminderJob's SLOT_WIDTH_MINUTES — the match window and
  // the tick interval have to be equal for exactly-one-tick-per-target to hold.
  { name: 'meal-reminders', pattern: '*/5 * * * *' },
  { name: 'streak-saver', pattern: '*/30 * * * *' },
  { name: 'weekly-report', pattern: '0 * * * *' },
];

/** Long-lived, stateful singletons (circuit breakers, HTTP/2 session, JWT cache). */
function buildDependencies() {
  const repository = new PrismaDeviceTokenRepository(prisma);
  const preferencesPort = new MeNotificationPreferencesAdapter(new PrismaMePreferencesRepository(prisma));
  // Both platforms go through FCM — the mobile app registers FCM tokens for iOS
  // too, and FCM relays those to APNs. ApnsPushAdapter is kept for a possible
  // future direct-APNs path but is not wired here.
  const sendPushToUser = new SendPushToUser(repository, new FcmPushAdapter());

  const dayLogsPort = new NutritionLoggingDayLogsAdapter(
    new GetLoggedMealTypesForDateRange(new PrismaMealItemRepository(prisma)),
  );
  const getTodayStatus = new GetTodayStatus(dayLogsPort);
  const getWeekProgress = new GetWeekProgress(dayLogsPort);
  const getMealAverages = new GetMealAverages(new PrismaMealLogReadModelRepository(prisma));

  return {
    repository,
    preferencesPort,
    sendPushToUser,
    dayCompletion: new DailyTrackingCompletionAdapter(getTodayStatus),
    weeklySummary: new WeeklySummaryAdapter(getTodayStatus, getWeekProgress, getMealAverages),
    baseGuard: new RedisSendGuard(cacheRedisClient),
  };
}

type Dependencies = ReturnType<typeof buildDependencies>;
let dependencies: Dependencies | undefined;

function getDependencies(): Dependencies {
  dependencies ??= buildDependencies();
  return dependencies;
}

async function dispatch(name: ScheduledJobName): Promise<void> {
  const deps = getDependencies();
  const guard = new MemoizingSendGuard(deps.baseGuard);

  if (name === 'meal-reminders') {
    const result = await new MealReminderJob(
      deps.repository,
      deps.preferencesPort,
      deps.sendPushToUser,
      guard,
    ).execute();
    logger.info({ job: name, result }, 'scheduled notification run complete');
    return;
  }

  if (name === 'streak-saver') {
    const result = await new StreakSaverAlertJob(
      deps.repository,
      deps.preferencesPort,
      deps.dayCompletion,
      deps.sendPushToUser,
      guard,
    ).execute();
    logger.info({ job: name, result }, 'scheduled notification run complete');
    return;
  }

  const result = await new WeeklyReportJob(
    deps.repository,
    deps.preferencesPort,
    deps.weeklySummary,
    deps.sendPushToUser,
    guard,
  ).execute();
  logger.info({ job: name, result }, 'scheduled notification run complete');
}

export const notificationsScheduledWorker = env.NOTIFICATIONS_ENABLED
  ? createWorker<BaseJobPayload>(QUEUE_NAME, (job) =>
      // Each fire gets its own trace id (the repeatable payload is fixed).
      runWithContext({ traceId: randomUUID() }, () => dispatch(job.name as ScheduledJobName)),
    )
  : undefined;

let queue: Queue<BaseJobPayload> | undefined;

/** Registers the three repeatable schedulers. Called from main.ts after listen(). */
export async function registerNotificationSchedules(): Promise<void> {
  if (!env.NOTIFICATIONS_ENABLED) {
    logger.warn('NOTIFICATIONS_ENABLED is false — scheduled notifications not registered');
    return;
  }

  queue ??= createQueue<BaseJobPayload>(QUEUE_NAME);
  for (const schedule of SCHEDULES) {
    await registerRepeatableJob(queue, {
      jobId: schedule.name,
      pattern: schedule.pattern,
      payload: { traceId: randomUUID() },
    });
  }
  logger.info({ schedules: SCHEDULES.map((schedule) => schedule.name) }, 'scheduled notifications registered');
}
