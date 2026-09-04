import { env } from '../../../shared/config/env';
import { createModuleLogger } from '../../../shared/observability/logger';
import { resolveLocalWallClock } from '../domain/localWallClock';
import { weeklyReportContent } from '../domain/NotificationCopy';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';
import type { NotificationPreferences, NotificationPreferencesPort } from '../ports/NotificationPreferencesPort';
import type { WeeklySummaryPort } from '../ports/WeeklySummaryPort';
import type { SendPushToUser } from '../use-cases/SendPushToUser';
import { PreferenceCache, paginateDevices } from './deviceIteration';
import type { SendGuardPort } from './SendGuard';

const logger = createModuleLogger('notifications');

const GUARD_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * Runs hourly. Fires once per user per ISO week, at
 * {@link env.WEEKLY_REPORT_LOCAL_HOUR} on {@link env.WEEKLY_REPORT_WEEKDAY}
 * (0 = Sunday .. 6 = Saturday) in that device's local zone.
 */
export class WeeklyReportJob {
  constructor(
    private readonly repository: DeviceTokenRepositoryPort,
    private readonly preferencesPort: NotificationPreferencesPort,
    private readonly weeklySummary: WeeklySummaryPort,
    private readonly sendPushToUser: SendPushToUser,
    private readonly guard: SendGuardPort,
    private readonly weekday: number = env.WEEKLY_REPORT_WEEKDAY,
    private readonly localHour: number = env.WEEKLY_REPORT_LOCAL_HOUR,
  ) {}

  async execute(now: Date = new Date()): Promise<{ scanned: number; sent: number }> {
    const preferences = new PreferenceCache(this.preferencesPort);
    let scanned = 0;
    let sent = 0;

    for await (const device of paginateDevices(this.repository)) {
      scanned += 1;
      const local = resolveLocalWallClock(now, device.timezone);
      if (local.weekday !== this.weekday || local.hour !== this.localHour) {
        continue;
      }

      let prefs: NotificationPreferences;
      try {
        prefs = await preferences.get(device.userId);
      } catch (err) {
        logger.error({ err, userId: device.userId }, 'failed to load notification preferences');
        continue;
      }
      if (!prefs.masterEnabled || !prefs.weeklyReport) {
        continue;
      }

      const guardKey = `weekly:${device.userId}:${local.isoWeekKey}`;
      if (!(await this.guard.claim(guardKey, GUARD_TTL_SECONDS))) {
        continue;
      }

      let summary: Awaited<ReturnType<WeeklySummaryPort['getForUser']>>;
      try {
        summary = await this.weeklySummary.getForUser(device.userId);
      } catch (err) {
        logger.error({ err, userId: device.userId }, 'failed to build weekly summary');
        continue;
      }

      const content = weeklyReportContent(summary, device.locale);
      const tally = await this.sendPushToUser.execute({
        userId: device.userId,
        title: content.title,
        body: content.body,
        data: { type: 'weekly_report' },
      });
      sent += tally.sent;
      logger.info({ userId: device.userId, summary, tally }, 'weekly report dispatched');
    }

    return { scanned, sent };
  }
}
