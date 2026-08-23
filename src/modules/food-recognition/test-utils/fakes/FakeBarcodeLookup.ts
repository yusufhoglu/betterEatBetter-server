import type { BarcodeProduct } from '../../ports/BarcodeLookupPort';
import type { BarcodeLookupPort } from '../../ports/BarcodeLookupPort';

/**
 * Fake barcode lookup for unit tests.
 * Tracks call count to verify that negative-cache hits don't reach the external lookup.
 */
export class FakeBarcodeLookup implements BarcodeLookupPort {
  callCount = 0;

  constructor(private readonly products: Map<string, BarcodeProduct> = new Map()) {}

  async lookup(barcode: string): Promise<BarcodeProduct | null> {
    this.callCount++;
    return this.products.get(barcode) ?? null;
  }

  /** Factory: pre-loaded with a specific product. */
  static withProduct(product: BarcodeProduct): FakeBarcodeLookup {
    const map = new Map([[product.barcode, product]]);
    return new FakeBarcodeLookup(map);
  }

  /** Factory: always returns null (product not found). */
  static empty(): FakeBarcodeLookup {
    return new FakeBarcodeLookup();
  }
}
