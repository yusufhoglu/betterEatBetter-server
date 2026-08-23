import { prisma } from '../../../../shared/persistence/db';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { FoodCatalogSearchPort, CatalogItem } from '../../ports/FoodCatalogSearchPort';

const logger = createModuleLogger('food-recognition');

/**
 * Searches the locally imported USDA FoodData Central data using Postgres
 * full-text search (GIN tsvector index on the name column).
 *
 * NEVER calls the live USDA API — data must be pre-loaded via npm run import:usda.
 */
export class CatalogSearchAdapter implements FoodCatalogSearchPort {
  async search(query: string, limit = 20): Promise<CatalogItem[]> {
    logger.debug({ query, limit }, 'catalog full-text search');

    // Use Postgres full-text search: plainto_tsquery for user-friendly input
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        caloriesPer100g: number;
        proteinPer100g: number;
        carbsPer100g: number;
        fatPer100g: number;
      }>
    >`
      SELECT id, name, "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"
      FROM food_catalog_items
      WHERE to_tsvector('english', name) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', name), plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit}
    `;

    return results.map((row) => ({
      id: row.id,
      name: row.name,
      caloriesPer100g: row.caloriesPer100g,
      proteinPer100g: row.proteinPer100g,
      carbsPer100g: row.carbsPer100g,
      fatPer100g: row.fatPer100g,
    }));
  }
}
