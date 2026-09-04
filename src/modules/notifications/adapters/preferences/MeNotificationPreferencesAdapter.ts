import type { MePreferencesRepositoryPort, NotificationPreferences } from '../../../me/ports/MePreferencesRepositoryPort';
import type { NotificationPreferencesPort } from '../../ports/NotificationPreferencesPort';

/** Adapts the `me` module's preferences repository to the local read-only port. */
export class MeNotificationPreferencesAdapter implements NotificationPreferencesPort {
  constructor(private readonly mePreferences: MePreferencesRepositoryPort) {}

  get(userId: string): Promise<NotificationPreferences> {
    return this.mePreferences.getNotificationPreferences(userId);
  }
}
