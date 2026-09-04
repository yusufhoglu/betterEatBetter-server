import type { DevicePlatform, DeviceToken } from '../domain/DeviceToken';
import type { Locale } from '../../../shared/i18n/locale';

export interface UpsertDeviceTokenInput {
  userId: string;
  platform: DevicePlatform;
  token: string;
  timezone: string;
  locale: Locale;
}

export interface DeviceTokenPage {
  tokens: DeviceToken[];
  /** Pass back as `cursor` to fetch the next page; `null` when exhausted. */
  nextCursor: string | null;
}

export interface DeviceTokenRepositoryPort {
  /** Insert or refresh the row keyed by `token` (a token can move between users on a shared device). */
  upsertByToken(input: UpsertDeviceTokenInput): Promise<DeviceToken>;
  /** Idempotent — no error if the token is already gone. */
  deleteByToken(token: string): Promise<void>;
  listByUserId(userId: string): Promise<DeviceToken[]>;
  /** Ordered, cursor-paginated scan of every token — used by the scheduled jobs. */
  listPage(input: { cursor?: string; limit: number }): Promise<DeviceTokenPage>;
}
