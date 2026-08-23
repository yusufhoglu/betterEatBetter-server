import type { BarcodeProduct } from '../../ports/BarcodeLookupPort';
import type { BarcodeCachePort } from '../../ports/BarcodeCachePort';

/**
 * In-memory barcode cache for unit tests.
 * Stores positive and negative entries separately so test assertions can
 * inspect cache state without TTL complexity.
 */
export class FakeBarcodeCache implements BarcodeCachePort {
  private readonly positiveCache = new Map<string, BarcodeProduct>();
  private readonly negativeCache = new Set<string>();

  async get(barcode: string): Promise<BarcodeProduct | 'NOT_FOUND' | null> {
    if (this.positiveCache.has(barcode)) {
      return this.positiveCache.get(barcode)!;
    }
    if (this.negativeCache.has(barcode)) {
      return 'NOT_FOUND';
    }
    return null;
  }

  async setFound(barcode: string, product: BarcodeProduct): Promise<void> {
    this.positiveCache.set(barcode, product);
    this.negativeCache.delete(barcode);
  }

  async setNotFound(barcode: string): Promise<void> {
    this.negativeCache.add(barcode);
    this.positiveCache.delete(barcode);
  }

  /** Test helper — returns true if the barcode has a positive cache entry. */
  hasPositive(barcode: string): boolean {
    return this.positiveCache.has(barcode);
  }

  /** Test helper — returns true if the barcode has a negative cache entry. */
  hasNegative(barcode: string): boolean {
    return this.negativeCache.has(barcode);
  }
}
