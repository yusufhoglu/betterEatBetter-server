import IORedis from 'ioredis';
import { env } from '../config/env';

/** BullMQ requires this setting; kept on a connection fully separate from the cache client. */
export const queueRedisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
