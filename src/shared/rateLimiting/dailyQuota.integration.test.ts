import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import IORedis from 'ioredis';

/**
 * `shared/cache/redisCacheClient` builds its connection once, from
 * `env.REDIS_CACHE_URL`, at module-load time. `dailyQuota` (and the cache
 * client it pulls in) is therefore imported dynamically below, after the Redis
 * testcontainer starts and `REDIS_CACHE_URL` is set — a static top-level import
 * would freeze `env` with jest.setup.ts's `redis://localhost:6380` fallback.
 */
describe('dailyQuota (integration)', () => {
  let container: StartedRedisContainer;
  let redis: IORedis;
  let mod: typeof import('./dailyQuota');

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    process.env.REDIS_CACHE_URL = container.getConnectionUrl();
    process.env.RATE_LIMIT_ENABLED = 'true';

    mod = await import('./dailyQuota');

    redis = new IORedis(container.getConnectionUrl(), { lazyConnect: true });
    await redis.connect();
  }, 60_000);

  afterAll(async () => {
    await redis.quit();
    const { cacheRedisClient } = await import('../cache/redisCacheClient');
    await cacheRedisClient.quit();
    await container.stop();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('allows calls up to the limit, then rejects with FREE_TIER_DAILY_LIMIT', async () => {
    await mod.consumeDailyQuota('photo:user-1', 2);
    await mod.consumeDailyQuota('photo:user-1', 2);

    await expect(mod.consumeDailyQuota('photo:user-1', 2)).rejects.toMatchObject({
      code: 'FREE_TIER_DAILY_LIMIT',
      httpStatus: 429,
    });
  });

  it('does not consume a unit on a rejected call', async () => {
    await mod.consumeDailyQuota('chat:user-1', 1);
    await expect(mod.consumeDailyQuota('chat:user-1', 1)).rejects.toBeDefined();
    await expect(mod.consumeDailyQuota('chat:user-1', 1)).rejects.toBeDefined();

    const status = await mod.peekDailyQuota('chat:user-1', 1);
    expect(status.used).toBe(1);
  });

  it('peek reports usage without mutating the counter', async () => {
    await mod.consumeDailyQuota('photo:user-2', 5);

    const first = await mod.peekDailyQuota('photo:user-2', 5);
    const second = await mod.peekDailyQuota('photo:user-2', 5);

    expect(first).toMatchObject({ used: 1, limit: 5, remaining: 4 });
    expect(second.used).toBe(1);
  });

  it('refund returns one consumed unit', async () => {
    await mod.consumeDailyQuota('photo:user-3', 1);
    await mod.refundDailyQuota('photo:user-3');

    const status = await mod.peekDailyQuota('photo:user-3', 1);
    expect(status.used).toBe(0);

    // ...and the freed slot is usable again
    await expect(mod.consumeDailyQuota('photo:user-3', 1)).resolves.toBeUndefined();
  });

  it('keeps counters for different keys independent', async () => {
    await mod.consumeDailyQuota('photo:user-4', 1);

    await expect(mod.consumeDailyQuota('chat:user-4', 1)).resolves.toBeUndefined();
  });

  it('starts a fresh count on the next UTC day', async () => {
    const day1 = new Date('2026-01-01T12:00:00.000Z');
    const day2 = new Date('2026-01-02T00:30:00.000Z');

    await mod.consumeDailyQuota('photo:user-5', 1, day1);
    await expect(mod.consumeDailyQuota('photo:user-5', 1, day1)).rejects.toBeDefined();

    await expect(mod.consumeDailyQuota('photo:user-5', 1, day2)).resolves.toBeUndefined();
  });

  it('reports resetsAt as the next UTC midnight', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const status = await mod.peekDailyQuota('photo:user-6', 1, now);

    expect(status.resetsAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
