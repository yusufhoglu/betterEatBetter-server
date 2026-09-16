import { prisma } from '../../../../shared/persistence/db';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { FoodCatalogSearchPort, CatalogItem } from '../../ports/FoodCatalogSearchPort';

const logger = createModuleLogger('food-recognition');

// Branded/restaurant items rank above generic USDA items at equal text relevance —
// commercial products (chains, packaged goods) are the priority match for this search.
const BRANDED_RANK_BOOST = 1.5;

/**
 * Searches the locally imported food catalog using Postgres full-text search
 * (GIN tsvector index on the name column). Covers both generic USDA FoodData
 * Central items and branded/restaurant-chain items imported separately.
 *
 * NEVER calls a live external API — data must be pre-loaded via npm run import:usda
 * and npm run import:branded.
 */
export class CatalogSearchAdapter implements FoodCatalogSearchPort {
  async search(query: string, limit = 20): Promise<CatalogItem[]> {
    logger.debug({ query, limit }, 'catalog full-text search');

    // Use Postgres full-text search: plainto_tsquery for user-friendly input
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        brand: string | null;
        category: string | null;
        basis: 'PER_100G' | 'PER_SERVING';
        servingLabel: string | null;
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      }>
    >`
      SELECT id, name, brand, category, basis, "servingLabel", calories, "proteinG", "carbsG", "fatG"
      FROM food_catalog_items
      WHERE to_tsvector('english', name) @@ plainto_tsquery('english', ${query})
      ORDER BY ts_rank(to_tsvector('english', name), plainto_tsquery('english', ${query}))
        * (CASE WHEN basis = 'PER_SERVING' THEN ${BRANDED_RANK_BOOST} ELSE 1.0 END) DESC
      LIMIT ${limit}
    `;

    return results.map((row) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      basis: row.basis,
      servingLabel: row.servingLabel,
      calories: row.calories,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
    }));
  }
}
