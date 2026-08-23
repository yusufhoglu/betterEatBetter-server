import { cacheRedisClient } from '../cache/redisCacheClient';
import { RateLimitError } from '../errors/RateLimitError';

/**
 * Redis sorted-set sliding-window log. The caller owns the key format
 * (`chat:${userId}`, `signin:${ip}`, ...) — this function knows nothing
 * about modules, only key/limit/window.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const redisKey = `ratelimit:${key}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  const pipeline = cacheRedisClient.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  pipeline.zadd(redisKey, now, member);
  pipeline.zcard(redisKey);
  pipeline.expire(redisKey, windowSeconds);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number | undefined;

  if (count !== undefined && count > limit) {
    throw new RateLimitError('RATE_LIMIT_EXCEEDED', `Rate limit exceeded for "${key}"`, windowSeconds);
  }
}
