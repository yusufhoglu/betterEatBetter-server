import type { BarcodeProduct } from './BarcodeLookupPort';

/**
 * Cache port for barcode lookups.
 *
 * Three distinct states for `get()`:
 * - `BarcodeProduct`  → positive hit (product found, cached for 7 days)
 * - `'NOT_FOUND'`     → negative hit (product was looked up before but doesn't exist;
 *                       cached for 1 hour to prevent hammering external API)
 * - `null`            → cache miss (never looked up, must call external API)
 */
export interface BarcodeCachePort {
  get(barcode: string): Promise<BarcodeProduct | 'NOT_FOUND' | null>;

  /** Caches a positive result for 7 days. */
  setFound(barcode: string, product: BarcodeProduct): Promise<void>;

  /** Caches a negative result (product not found) for 1 hour. */
  setNotFound(barcode: string): Promise<void>;
}
