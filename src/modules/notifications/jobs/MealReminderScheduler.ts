import { createModuleLogger } from '../../../shared/observability/logger';
import { matchReminderSlot } from '../domain/matchReminderSlot';
import { resolveLocalWallClock } from '../domain/localWallClock';
import { mealReminderContent, type MealSlot } from '../domain/NotificationCopy';
import type { NotificationPreferences, NotificationPreferencesPort } from '../ports/NotificationPreferencesPort';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';
import type { SendPushToUser } from '../use-cases/SendPushToUser';
import { PreferenceCache, paginateDevices } from './deviceIteration';
import type { SendGuardPort } from './SendGuard';

const logger = createModuleLogger('notifications');

const SLOT_WIDTH_MINUTES = 15;
const GUARD_TTL_SECONDS = 20 * 60;
const MEALS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner'];

function slotPref(prefs: NotificationPreferences, meal: MealSlot): { enabled: boolean; time: string } {
  return prefs[meal];
}

/**
 * Runs every {@link SLOT_WIDTH_MINUTES} minutes. Scans every registered device,
 * and for each one whose local wall-clock has just entered a user-configured
 * meal time (and that meal reminder is enabled) sends one push per user,
 * de-duped by a Redis guard so overlapping runs / extra devices don't double up.
 */
export class MealReminderJob {
  constructor(
    private readonly repository: DeviceTokenRepositoryPort,
    private readonly preferencesPort: NotificationPreferencesPort,
    private readonly sendPushToUser: SendPushToUser,
    private readonly guard: SendGuardPort,
  ) {}

  async execute(now: Date = new Date()): Promise<{ scanned: number; sent: number }> {
    const preferences = new PreferenceCache(this.preferencesPort);
    let scanned = 0;
    let sent = 0;

    for await (const device of paginateDevices(this.repository)) {
      scanned += 1;
      const local = resolveLocalWallClock(now, device.timezone);
      if (local.fellBackToUtc) {
        logger.warn({ userId: device.userId, timezone: device.timezone }, 'device time zone unresolved — using UTC');
      }

      let prefs: NotificationPreferences;
      try {
        prefs = await preferences.get(device.userId);
      } catch (err) {
        logger.error({ err, userId: device.userId }, 'failed to load notification preferences');
        continue;
      }
      if (!prefs.masterEnabled) {
        continue;
      }

      for (const meal of MEALS) {
        const pref = slotPref(prefs, meal);
        if (!pref.enabled) {
          continue;
        }

        let matches = false;
        try {
          matches = matchReminderSlot(local, pref.time, SLOT_WIDTH_MINUTES);
        } catch (err) {
          logger.warn({ err, userId: device.userId, meal, time: pref.time }, 'invalid reminder time — skipping');
          continue;
        }
        if (!matches) {
          continue;
        }

        const guardKey = `meal:${device.userId}:${local.dateKey}:${meal}`;
        if (!(await this.guard.claim(guardKey, GUARD_TTL_SECONDS))) {
          continue;
        }

        const content = mealReminderContent(meal, device.locale);
        const tally = await this.sendPushToUser.execute({
          userId: device.userId,
          title: content.title,
          body: content.body,
          data: { type: 'meal_reminder', meal },
        });
        sent += tally.sent;
        logger.info({ userId: device.userId, meal, tally }, 'meal reminder dispatched');
      }
    }

    return { scanned, sent };
  }
}
