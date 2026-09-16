import { SearchFoodCatalog } from './SearchFoodCatalog';
import type { FoodCatalogSearchPort, CatalogItem } from '../ports/FoodCatalogSearchPort';

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'usda-001',
    name: 'Chicken Breast, cooked',
    brand: null,
    category: null,
    basis: 'PER_100G',
    servingLabel: null,
    calories: 165,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
  },
  {
    id: 'usda-002',
    name: 'Chicken Thigh, cooked',
    brand: null,
    category: null,
    basis: 'PER_100G',
    servingLabel: null,
    calories: 209,
    proteinG: 26,
    carbsG: 0,
    fatG: 10.9,
  },
];

function makeCatalog(items: CatalogItem[]): FoodCatalogSearchPort {
  return { search: jest.fn().mockResolvedValue(items) };
}

describe('SearchFoodCatalog', () => {
  it('returns search results from the catalog port', async () => {
    const catalog = makeCatalog(CATALOG_ITEMS);
    const useCase = new SearchFoodCatalog(catalog);

    const result = await useCase.execute({ query: 'chicken' });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.name).toBe('Chicken Breast, cooked');
  });

  it('passes query and limit to the catalog port', async () => {
    const catalog = makeCatalog([]);
    const useCase = new SearchFoodCatalog(catalog);

    await useCase.execute({ query: 'apple', limit: 5 });

    expect(catalog.search).toHaveBeenCalledWith('apple', 5);
  });

  it('uses default limit of 20 when not specified', async () => {
    const catalog = makeCatalog([]);
    const useCase = new SearchFoodCatalog(catalog);

    await useCase.execute({ query: 'rice' });

    expect(catalog.search).toHaveBeenCalledWith('rice', 20);
  });

  it('returns an empty array when no results match', async () => {
    const catalog = makeCatalog([]);
    const useCase = new SearchFoodCatalog(catalog);

    const result = await useCase.execute({ query: 'xyznotarealfoodnamethatwouldmatch' });

    expect(result.items).toHaveLength(0);
  });
});
