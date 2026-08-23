/** A single result from the food catalog (pre-imported USDA data). */
export interface CatalogItem {
  id: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

export interface FoodCatalogSearchPort {
  /**
   * Full-text search against the locally imported food catalog table.
   * NEVER calls a live external API — data is pre-imported from USDA FoodData Central.
   */
  search(query: string, limit?: number): Promise<CatalogItem[]>;
}
