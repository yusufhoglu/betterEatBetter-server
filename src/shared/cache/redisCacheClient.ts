import IORedis from 'ioredis';
import { env } from '../config/env';

/** Separate instance/db index from the BullMQ connection — cache traffic never competes with queue traffic. */
export const cacheRedisClient = new IORedis(env.REDIS_CACHE_URL);
