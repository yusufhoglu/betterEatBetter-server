import type { DeviceToken } from '../domain/DeviceToken';
import type { NotificationPreferences, NotificationPreferencesPort } from '../ports/NotificationPreferencesPort';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';

export const DEVICE_PAGE_SIZE = 500;

/** Yields every registered device token, one cursor page at a time. */
export async function* paginateDevices(
  repository: DeviceTokenRepositoryPort,
  pageSize: number = DEVICE_PAGE_SIZE,
): AsyncGenerator<DeviceToken> {
  let cursor: string | undefined;
  do {
    const page = await repository.listPage({ cursor, limit: pageSize });
    for (const token of page.tokens) {
      yield token;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
}

/** Per-run cache so each user's preferences are fetched at most once. */
export class PreferenceCache {
  private readonly cache = new Map<string, Promise<NotificationPreferences>>();

  constructor(private readonly port: NotificationPreferencesPort) {}

  get(userId: string): Promise<NotificationPreferences> {
    let entry = this.cache.get(userId);
    if (!entry) {
      entry = this.port.get(userId);
      this.cache.set(userId, entry);
    }
    return entry;
  }
}
