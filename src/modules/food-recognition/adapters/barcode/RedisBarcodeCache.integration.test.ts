import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import IORedis from 'ioredis';
import { RedisBarcodeCache } from './RedisBarcodeCache';
import type { BarcodeProduct } from '../../ports/BarcodeLookupPort';

const TEST_PRODUCT: BarcodeProduct = {
  barcode: '5901234123457',
  name: 'Test Yogurt',
  items: [
    {
      name: 'Test Yogurt',
      portionGrams: 100,
      calories: 60,
      proteinGrams: 4,
      carbsGrams: 8,
      fatGrams: 1,
    },
  ],
  macros: { totalCalories: 60, totalProteinGrams: 4, totalCarbsGrams: 8, totalFatGrams: 1 },
};

describe('RedisBarcodeCache (integration)', () => {
  let container: StartedRedisContainer;
  let redis: IORedis;
  let cache: RedisBarcodeCache;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    redis = new IORedis(container.getConnectionUrl(), { lazyConnect: true });
    await redis.connect();
    cache = new RedisBarcodeCache(redis);
  }, 60_000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

  afterEach(async () => {
    await redis.flushall();
  });

  it('returns null (cache miss) when barcode has never been looked up', async () => {
    const result = await cache.get('unknown-barcode');
    expect(result).toBeNull();
  });

  it('returns the product after setFound (positive cache hit)', async () => {
    await cache.setFound(TEST_PRODUCT.barcode, TEST_PRODUCT);

    const result = await cache.get(TEST_PRODUCT.barcode);

    expect(result).not.toBeNull();
    expect(result).not.toBe('NOT_FOUND');
    expect((result as BarcodeProduct).name).toBe('Test Yogurt');
    expect((result as BarcodeProduct).barcode).toBe(TEST_PRODUCT.barcode);
  });

  it('returns NOT_FOUND sentinel after setNotFound (negative cache hit)', async () => {
    await cache.setNotFound('missing-barcode');

    const result = await cache.get('missing-barcode');

    expect(result).toBe('NOT_FOUND');
  });

  it('positive entry has a TTL set (TTL > 0)', async () => {
    await cache.setFound(TEST_PRODUCT.barcode, TEST_PRODUCT);

    const ttl = await redis.ttl(`barcode:${TEST_PRODUCT.barcode}`);
    // Should be close to 7 days (604800s) — allow generous tolerance
    expect(ttl).toBeGreaterThan(600_000);
    expect(ttl).toBeLessThanOrEqual(604_800);
  });

  it('negative entry has a shorter TTL (around 1 hour)', async () => {
    await cache.setNotFound('missing-barcode');

    const ttl = await redis.ttl('barcode:missing-barcode');
    // Should be close to 3600s — allow small tolerance
    expect(ttl).toBeGreaterThan(3_500);
    expect(ttl).toBeLessThanOrEqual(3_600);
  });

  it('overwrites a negative entry with a positive one', async () => {
    await cache.setNotFound(TEST_PRODUCT.barcode);
    expect(await cache.get(TEST_PRODUCT.barcode)).toBe('NOT_FOUND');

    await cache.setFound(TEST_PRODUCT.barcode, TEST_PRODUCT);
    const result = await cache.get(TEST_PRODUCT.barcode);
    expect(result).not.toBe('NOT_FOUND');
    expect((result as BarcodeProduct).name).toBe('Test Yogurt');
  });
});
