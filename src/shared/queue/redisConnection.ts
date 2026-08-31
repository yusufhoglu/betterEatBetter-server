import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../observability/logger';

/** BullMQ requires this setting; kept on a connection fully separate from the cache client. */
export const queueRedisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// ioredis reconnects on its own; without an `error` listener a transient
// disconnect (e.g. Docker Desktop loopback proxy dropping the socket) is
// re-emitted as an "Unhandled error event" and can crash the process.
queueRedisConnection.on('error', (err) => {
  logger.warn({ err }, 'queue redis connection error');
});
