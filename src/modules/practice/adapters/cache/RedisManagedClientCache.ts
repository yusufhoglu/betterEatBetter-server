import type { Redis } from 'ioredis';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { ManagedClientCachePort } from '../../ports/ManagedClientCachePort';

const logger = createModuleLogger('practice');
const TTL_SECONDS = 60;

function key(clientId: string): string {
  return `practice:managed:${clientId}`;
}

/** Fail-open on reads (a Redis blip falls through to Postgres), best-effort on writes. */
export class RedisManagedClientCache implements ManagedClientCachePort {
  constructor(private readonly redis: Redis) {}

  async get(clientId: string): Promise<boolean | null> {
    try {
      const value = await this.redis.get(key(clientId));
      return value === null ? null : value === '1';
    } catch (err) {
      logger.warn({ err }, 'managed-client cache read failed');
      return null;
    }
  }

  async set(clientId: string, managed: boolean): Promise<void> {
    try {
      await this.redis.set(key(clientId), managed ? '1' : '0', 'EX', TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, 'managed-client cache write failed');
    }
  }

  async invalidate(clientId: string): Promise<void> {
    try {
      await this.redis.del(key(clientId));
    } catch (err) {
      logger.warn({ err, clientId }, 'managed-client cache invalidation failed');
    }
  }
}
