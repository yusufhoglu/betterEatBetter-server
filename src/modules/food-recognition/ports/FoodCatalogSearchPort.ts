/** A single result from the food catalog (pre-imported USDA + branded data). */
export interface CatalogItem {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  /** PER_100G for generic USDA items, PER_SERVING for branded/restaurant items. */
  basis: 'PER_100G' | 'PER_SERVING';
  servingLabel: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodCatalogSearchPort {
  /**
   * Full-text search against the locally imported food catalog table.
   * NEVER calls a live external API — data is pre-imported from USDA FoodData Central
   * and branded/restaurant-chain sources.
   */
  search(query: string, limit?: number): Promise<CatalogItem[]>;
}
