import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { BarcodeCachePort } from '../ports/BarcodeCachePort';
import type { BarcodeLookupPort } from '../ports/BarcodeLookupPort';
import type { BarcodeProduct } from '../ports/BarcodeLookupPort';
import type { FoodEntry } from '../domain/FoodEntry';

const logger = createModuleLogger('food-recognition');

export interface RecognizeFromBarcodeInput {
  barcode: string;
  userId: string;
}

export type RecognizeFromBarcodeOutput = Omit<FoodEntry, 'id' | 'userId' | 'status' | 'needsUserAction' | 'errorCode' | 'createdAt'> & {
  source: 'barcode';
  needsUserAction: false;
};

/**
 * Synchronous barcode recognition flow (cache-aside pattern):
 * 1. Check cache → cache hit → return immediately
 * 2. Cache returns 'NOT_FOUND' → skip external lookup (negative cache), throw NotFoundError
 * 3. Cache miss (null) → call external lookup → store result or NOT_FOUND in cache → return
 *
 * No persistent storage — result is returned directly in the response.
 */
export class RecognizeFromBarcode {
  constructor(
    private readonly cache: BarcodeCachePort,
    private readonly lookup: BarcodeLookupPort,
  ) {}

  async execute(input: RecognizeFromBarcodeInput): Promise<RecognizeFromBarcodeOutput> {
    const { barcode } = input;

    // Step 1: Check cache
    const cached = await this.cache.get(barcode);

    // Positive cache hit
    if (cached !== null && cached !== 'NOT_FOUND') {
      logger.debug({ barcode }, 'barcode cache hit');
      return this.toOutput(cached);
    }

    // Negative cache hit — product is known to not exist, skip external lookup
    if (cached === 'NOT_FOUND') {
      logger.debug({ barcode }, 'barcode negative cache hit — skipping external lookup');
      throw new NotFoundError('BARCODE_NOT_FOUND', `Barcode ${barcode} not found`);
    }

    // Cache miss — call external lookup
    logger.debug({ barcode }, 'barcode cache miss — calling external lookup');
    const product = await this.lookup.lookup(barcode);

    if (product === null) {
      await this.cache.setNotFound(barcode);
      throw new NotFoundError('BARCODE_NOT_FOUND', `Barcode ${barcode} not found`);
    }

    await this.cache.setFound(barcode, product);
    return this.toOutput(product);
  }

  private toOutput(product: BarcodeProduct): RecognizeFromBarcodeOutput {
    return {
      source: 'barcode',
      items: product.items,
      macros: product.macros,
      needsUserAction: false,
    };
  }
}
