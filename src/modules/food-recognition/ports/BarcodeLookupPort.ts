import type { FoodItem, MacroSummary } from '../domain/FoodEntry';

/** Normalized product data returned from an external barcode lookup. */
export interface BarcodeProduct {
  barcode: string;
  name: string;
  brandName?: string;
  items: FoodItem[];
  macros: MacroSummary;
}

export interface BarcodeLookupPort {
  /**
   * Looks up a product by barcode from an external data source (e.g. OpenFoodFacts).
   * Returns null if the product does not exist in the external source.
   */
  lookup(barcode: string): Promise<BarcodeProduct | null>;
}
