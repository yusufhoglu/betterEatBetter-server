import type { PrismaClient } from '@prisma/client';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '../../../../shared/i18n/locale';
import type { DevicePlatform, DeviceToken } from '../../domain/DeviceToken';
import type {
  DeviceTokenPage,
  DeviceTokenRepositoryPort,
  UpsertDeviceTokenInput,
} from '../../ports/DeviceTokenRepositoryPort';

type DeviceTokenDb = Pick<PrismaClient, 'deviceToken'>;

interface DeviceTokenRow {
  id: string;
  userId: string;
  platform: string;
  token: string;
  timezone: string;
  locale: string;
  lastSeenAt: Date;
}

function toLocale(value: string): Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value) ? (value as Locale) : DEFAULT_LOCALE;
}

function toDomain(row: DeviceTokenRow): DeviceToken {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as DevicePlatform,
    token: row.token,
    timezone: row.timezone,
    locale: toLocale(row.locale),
    lastSeenAt: row.lastSeenAt,
  };
}

export class PrismaDeviceTokenRepository implements DeviceTokenRepositoryPort {
  constructor(private readonly db: DeviceTokenDb) {}

  async upsertByToken(input: UpsertDeviceTokenInput): Promise<DeviceToken> {
    const row = await this.db.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId: input.userId,
        platform: input.platform,
        token: input.token,
        timezone: input.timezone,
        locale: input.locale,
      },
      update: {
        userId: input.userId,
        platform: input.platform,
        timezone: input.timezone,
        locale: input.locale,
        lastSeenAt: new Date(),
      },
    });

    return toDomain(row);
  }

  async deleteByToken(token: string): Promise<void> {
    await this.db.deviceToken.deleteMany({ where: { token } });
  }

  async listByUserId(userId: string): Promise<DeviceToken[]> {
    const rows = await this.db.deviceToken.findMany({
      where: { userId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listPage(input: { cursor?: string; limit: number }): Promise<DeviceTokenPage> {
    const rows = await this.db.deviceToken.findMany({
      where: input.cursor ? { id: { gt: input.cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: input.limit,
    });

    const nextCursor = rows.length === input.limit ? (rows[rows.length - 1]?.id ?? null) : null;
    return { tokens: rows.map(toDomain), nextCursor };
  }
}
