import { createModuleLogger } from '../../../shared/observability/logger';
import type { FoodCatalogSearchPort, CatalogItem } from '../ports/FoodCatalogSearchPort';

const logger = createModuleLogger('food-recognition');

const DEFAULT_SEARCH_LIMIT = 20;

export interface SearchFoodCatalogInput {
  query: string;
  limit?: number;
}

export interface SearchFoodCatalogOutput {
  items: CatalogItem[];
}

/**
 * Synchronous catalog search — queries the locally imported USDA FoodData Central
 * data stored in our own Postgres table. Never calls the live USDA API.
 */
export class SearchFoodCatalog {
  constructor(private readonly catalog: FoodCatalogSearchPort) {}

  async execute(input: SearchFoodCatalogInput): Promise<SearchFoodCatalogOutput> {
    const { query, limit = DEFAULT_SEARCH_LIMIT } = input;

    logger.debug({ query, limit }, 'searching food catalog');

    const items = await this.catalog.search(query, limit);

    return { items };
  }
}
