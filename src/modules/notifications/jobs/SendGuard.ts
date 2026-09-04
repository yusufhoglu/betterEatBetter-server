import type Redis from 'ioredis';
import { createModuleLogger } from '../../../shared/observability/logger';

const logger = createModuleLogger('notifications');

/**
 * De-dupes scheduled notifications. `claim` returns true at most once per key
 * per TTL window, so an overlapping / re-run job (or a second Node instance)
 * can't send the same reminder twice.
 */
export interface SendGuardPort {
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export class RedisSendGuard implements SendGuardPort {
  constructor(private readonly redis: Pick<Redis, 'set'>) {}

  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(`notif:guard:${key}`, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      // Fail-open: a Redis blip should not silently drop every notification.
      logger.warn({ err, key }, 'send guard unavailable — allowing send');
      return true;
    }
  }
}

/** In-run dedupe wrapper: a key already claimed this process run never hits Redis again. */
export class MemoizingSendGuard implements SendGuardPort {
  private readonly claimed = new Set<string>();

  constructor(private readonly inner: SendGuardPort) {}

  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.claimed.has(key)) {
      return false;
    }
    const ok = await this.inner.claim(key, ttlSeconds);
    if (ok) {
      this.claimed.add(key);
    }
    return ok;
  }
}
