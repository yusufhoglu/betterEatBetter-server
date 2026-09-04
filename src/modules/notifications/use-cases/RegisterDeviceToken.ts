import { ValidationError } from '../../../shared/errors/ValidationError';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '../../../shared/i18n/locale';
import { isDevicePlatform } from '../domain/DeviceToken';
import type { DeviceTokenRepositoryPort } from '../ports/DeviceTokenRepositoryPort';

export interface RegisterDeviceTokenInput {
  userId: string;
  token: string;
  platform: string;
  timezone: string;
  locale?: string;
}

function assertValidTimeZone(timezone: string): void {
  try {
    // Throws RangeError for an unknown IANA zone.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new ValidationError('INVALID_TIMEZONE', `"${timezone}" is not a valid IANA time zone`);
  }
}

/** Registers (or refreshes) one device's push token for the authenticated user. */
export class RegisterDeviceToken {
  constructor(private readonly repository: DeviceTokenRepositoryPort) {}

  async execute(input: RegisterDeviceTokenInput): Promise<{ id: string }> {
    const token = input.token.trim();
    if (!token) {
      throw new ValidationError('MISSING_DEVICE_TOKEN', 'token is required');
    }
    if (!isDevicePlatform(input.platform)) {
      throw new ValidationError('INVALID_PLATFORM', "platform must be 'ios' or 'android'");
    }
    if (!input.timezone?.trim()) {
      throw new ValidationError('MISSING_TIMEZONE', 'timezone is required');
    }
    assertValidTimeZone(input.timezone);

    const locale: Locale =
      input.locale && (SUPPORTED_LOCALES as readonly string[]).includes(input.locale)
        ? (input.locale as Locale)
        : DEFAULT_LOCALE;

    const saved = await this.repository.upsertByToken({
      userId: input.userId,
      platform: input.platform,
      token,
      timezone: input.timezone.trim(),
      locale,
    });

    return { id: saved.id };
  }
}
