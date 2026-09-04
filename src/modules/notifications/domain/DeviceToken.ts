import type { Locale } from '../../../shared/i18n/locale';

export type DevicePlatform = 'ios' | 'android';

/** A registered push destination for one physical device. */
export interface DeviceToken {
  id: string;
  userId: string;
  platform: DevicePlatform;
  /** FCM registration token (Android) or APNs device token (iOS). */
  token: string;
  /** IANA time zone the device last reported (e.g. `Europe/Istanbul`). */
  timezone: string;
  /** Language the scheduled jobs compose this device's copy in. */
  locale: Locale;
  lastSeenAt: Date;
}

export function isDevicePlatform(value: unknown): value is DevicePlatform {
  return value === 'ios' || value === 'android';
}
