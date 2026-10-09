import type { FoodOption } from '../domain/mealPlan';

/** The shared food catalog, as seen by the plan editor. */
export interface FoodSearchPort {
  search(query: string, limit: number): Promise<FoodOption[]>;
}
