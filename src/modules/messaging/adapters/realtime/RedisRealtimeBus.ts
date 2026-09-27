import IORedis, { type Redis } from 'ioredis';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { RealtimeEvent } from '../../domain/messagingTypes';
import type { RealtimePublisherPort } from '../../ports/RealtimePublisherPort';

const logger = createModuleLogger('messaging');

function channel(userId: string): string {
  return `rt:user:${userId}`;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

/**
 * Cross-instance realtime fan-out over Redis pub/sub. Publishing uses the
 * shared cache client; each process holds ONE extra subscriber connection
 * and multiplexes every local SSE connection over it, subscribing to a
 * user's channel only while that user has at least one open stream here.
 */
export class RedisRealtimeBus implements RealtimePublisherPort {
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<RealtimeListener>>();

  constructor(
    private readonly publisher: Redis,
    private readonly redisUrl: string,
  ) {}

  async publish(userIds: string[], event: RealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    await Promise.all(
      [...new Set(userIds)].map((userId) =>
        this.publisher.publish(channel(userId), payload).catch((err: unknown) => {
          logger.warn({ err, userId }, 'realtime publish failed');
        }),
      ),
    );
  }

  /** Returns an unsubscribe function; call it when the stream closes. */
  async subscribe(userId: string, listener: RealtimeListener): Promise<() => Promise<void>> {
    const subscriber = this.getSubscriber();
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
      await subscriber.subscribe(channel(userId));
    }
    set.add(listener);

    return async () => {
      const current = this.listeners.get(userId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(userId);
        await subscriber.unsubscribe(channel(userId)).catch((err: unknown) => {
          logger.warn({ err, userId }, 'realtime unsubscribe failed');
        });
      }
    };
  }

  private getSubscriber(): Redis {
    if (this.subscriber) {
      return this.subscriber;
    }
    const subscriber = new IORedis(this.redisUrl);
    subscriber.on('error', (err) => logger.warn({ err }, 'realtime subscriber connection error'));
    subscriber.on('message', (ch: string, message: string) => {
      const userId = ch.slice('rt:user:'.length);
      const set = this.listeners.get(userId);
      if (!set) {
        return;
      }
      let event: RealtimeEvent;
      try {
        event = JSON.parse(message) as RealtimeEvent;
      } catch {
        return;
      }
      for (const listener of set) {
        listener(event);
      }
    });
    this.subscriber = subscriber;
    return subscriber;
  }
}
