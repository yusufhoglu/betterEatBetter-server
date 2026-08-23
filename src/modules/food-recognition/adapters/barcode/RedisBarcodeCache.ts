import IORedis from 'ioredis';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { BarcodeCachePort } from '../../ports/BarcodeCachePort';
import type { BarcodeProduct } from '../../ports/BarcodeLookupPort';

const logger = createModuleLogger('food-recognition');

const POSITIVE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const NEGATIVE_TTL_SECONDS = 60 * 60; // 1 hour

/** Sentinel value stored in Redis for negative cache entries. */
const NOT_FOUND_SENTINEL = 'NOT_FOUND';

/**
 * Redis-backed barcode cache.
 * - Positive (product found): serialized JSON, TTL = 7 days
 * - Negative (product not found): literal 'NOT_FOUND' string, TTL = 1 hour
 * - Miss: key does not exist → returns null
 */
export class RedisBarcodeCache implements BarcodeCachePort {
  constructor(private readonly redis: IORedis) {}

  private key(barcode: string): string {
    return `barcode:${barcode}`;
  }

  async get(barcode: string): Promise<BarcodeProduct | 'NOT_FOUND' | null> {
    const value = await this.redis.get(this.key(barcode));

    if (value === null) {
      return null; // Cache miss
    }

    if (value === NOT_FOUND_SENTINEL) {
      return 'NOT_FOUND'; // Negative cache hit
    }

    try {
      return JSON.parse(value) as BarcodeProduct;
    } catch {
      logger.warn({ barcode }, 'Failed to parse cached barcode value — treating as miss');
      return null;
    }
  }

  async setFound(barcode: string, product: BarcodeProduct): Promise<void> {
    await this.redis.set(this.key(barcode), JSON.stringify(product), 'EX', POSITIVE_TTL_SECONDS);
  }

  async setNotFound(barcode: string): Promise<void> {
    await this.redis.set(this.key(barcode), NOT_FOUND_SENTINEL, 'EX', NEGATIVE_TTL_SECONDS);
  }
}
