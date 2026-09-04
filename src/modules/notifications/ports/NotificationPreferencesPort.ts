import type { NotificationPreferences } from '../../me/ports/MePreferencesRepositoryPort';

export type { NotificationPreferences };

/**
 * Read-only bridge to the `me` module's notification preferences. The
 * scheduled jobs filter recipients through this — they never touch the
 * `notification_preferences` table directly.
 */
export interface NotificationPreferencesPort {
  get(userId: string): Promise<NotificationPreferences>;
}
