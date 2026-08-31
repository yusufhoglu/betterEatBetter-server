import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../observability/logger';

/** Separate instance/db index from the BullMQ connection — cache traffic never competes with queue traffic. */
export const cacheRedisClient = new IORedis(env.REDIS_CACHE_URL);

// ioredis reconnects on its own; an `error` listener keeps a transient
// disconnect from surfacing as an "Unhandled error event" / process crash.
cacheRedisClient.on('error', (err) => {
  logger.warn({ err }, 'cache redis connection error');
});
