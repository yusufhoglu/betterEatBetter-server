import { SearchFoodCatalog } from '../../../food-recognition/use-cases/SearchFoodCatalog';
import { CatalogSearchAdapter } from '../../../food-recognition/adapters/search/CatalogSearchAdapter';
import type { FoodOption } from '../../domain/mealPlan';
import type { FoodSearchPort } from '../../ports/FoodSearchPort';

/** Reads the shared catalog through food-recognition's public use-case. */
export class CatalogFoodSearchAdapter implements FoodSearchPort {
  constructor(private readonly searchCatalog = new SearchFoodCatalog(new CatalogSearchAdapter())) {}

  async search(query: string, limit: number): Promise<FoodOption[]> {
    const { items } = await this.searchCatalog.execute({ query, limit });
    return items.map((item) => ({
      source: 'catalog',
      id: item.id,
      name: item.name,
      brand: item.brand,
      amount: item.basis === 'PER_100G' ? 100 : 1,
      unit: item.basis === 'PER_100G' ? 'g' : (item.servingLabel ?? 'porsiyon'),
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
    }));
  }
}
