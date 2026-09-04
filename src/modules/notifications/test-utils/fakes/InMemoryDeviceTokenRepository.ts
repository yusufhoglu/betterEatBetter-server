import { randomUUID } from 'node:crypto';
import type { DeviceToken } from '../../domain/DeviceToken';
import type {
  DeviceTokenPage,
  DeviceTokenRepositoryPort,
  UpsertDeviceTokenInput,
} from '../../ports/DeviceTokenRepositoryPort';

export class InMemoryDeviceTokenRepository implements DeviceTokenRepositoryPort {
  readonly rows = new Map<string, DeviceToken>();

  seed(token: DeviceToken): void {
    this.rows.set(token.token, token);
  }

  async upsertByToken(input: UpsertDeviceTokenInput): Promise<DeviceToken> {
    const existing = this.rows.get(input.token);
    const row: DeviceToken = {
      id: existing?.id ?? randomUUID(),
      userId: input.userId,
      platform: input.platform,
      token: input.token,
      timezone: input.timezone,
      locale: input.locale,
      lastSeenAt: new Date(),
    };
    this.rows.set(input.token, row);
    return row;
  }

  async deleteByToken(token: string): Promise<void> {
    this.rows.delete(token);
  }

  async listByUserId(userId: string): Promise<DeviceToken[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId).sort((a, b) => a.id.localeCompare(b.id));
  }

  async listPage(input: { cursor?: string; limit: number }): Promise<DeviceTokenPage> {
    const ordered = [...this.rows.values()].sort((a, b) => a.id.localeCompare(b.id));
    const start = input.cursor ? ordered.findIndex((row) => row.id > input.cursor!) : 0;
    const slice = start === -1 ? [] : ordered.slice(start, start + input.limit);
    const nextCursor = slice.length === input.limit ? (slice[slice.length - 1]?.id ?? null) : null;
    return { tokens: slice, nextCursor };
  }
}
