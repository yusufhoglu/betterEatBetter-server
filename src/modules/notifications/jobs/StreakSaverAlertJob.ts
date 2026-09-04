import { env } from '../../../shared/config/env';
import { createModuleLogger } from '../../../shared/observability/logger';
import { resolveLocalWallClock } from '../domain/localWallClock';
import { streakSaverContent } from '../domain/NotificationCopy';
import type { DayCompletionPort } from '../ports/DayCompletionPort';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';
import type { NotificationPreferences, NotificationPreferencesPort } from '../ports/NotificationPreferencesPort';
import type { SendPushToUser } from '../use-cases/SendPushToUser';
import { PreferenceCache, paginateDevices } from './deviceIteration';
import type { SendGuardPort } from './SendGuard';

const logger = createModuleLogger('notifications');

const GUARD_TTL_SECONDS = 6 * 60 * 60;

/**
 * Runs every 30 min. When a device's local hour reaches
 * {@link env.STREAK_SAVER_LOCAL_HOUR} and the day is not yet complete, nudges
 * the user so an active streak doesn't lapse at local midnight.
 */
export class StreakSaverAlertJob {
  constructor(
    private readonly repository: DeviceTokenRepositoryPort,
    private readonly preferencesPort: NotificationPreferencesPort,
    private readonly dayCompletion: DayCompletionPort,
    private readonly sendPushToUser: SendPushToUser,
    private readonly guard: SendGuardPort,
    private readonly localHour: number = env.STREAK_SAVER_LOCAL_HOUR,
  ) {}

  async execute(now: Date = new Date()): Promise<{ scanned: number; sent: number }> {
    const preferences = new PreferenceCache(this.preferencesPort);
    let scanned = 0;
    let sent = 0;

    for await (const device of paginateDevices(this.repository)) {
      scanned += 1;
      const local = resolveLocalWallClock(now, device.timezone);
      if (local.hour !== this.localHour) {
        continue;
      }

      let prefs: NotificationPreferences;
      try {
        prefs = await preferences.get(device.userId);
      } catch (err) {
        logger.error({ err, userId: device.userId }, 'failed to load notification preferences');
        continue;
      }
      if (!prefs.masterEnabled || !prefs.streakSaver) {
        continue;
      }

      let status: Awaited<ReturnType<DayCompletionPort['getTodayStatus']>>;
      try {
        status = await this.dayCompletion.getTodayStatus(device.userId);
      } catch (err) {
        logger.error({ err, userId: device.userId }, 'failed to load today completion');
        continue;
      }
      if (status.completed || status.currentStreak < 1) {
        continue;
      }

      const guardKey = `streak:${device.userId}:${local.dateKey}`;
      if (!(await this.guard.claim(guardKey, GUARD_TTL_SECONDS))) {
        continue;
      }

      const content = streakSaverContent(status.currentStreak, device.locale);
      const tally = await this.sendPushToUser.execute({
        userId: device.userId,
        title: content.title,
        body: content.body,
        data: { type: 'streak_saver', currentStreak: String(status.currentStreak) },
      });
      sent += tally.sent;
      logger.info({ userId: device.userId, currentStreak: status.currentStreak, tally }, 'streak saver dispatched');
    }

    return { scanned, sent };
  }
}
