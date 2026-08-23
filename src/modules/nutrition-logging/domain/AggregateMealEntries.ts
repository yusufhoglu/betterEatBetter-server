import type { LoggedMealEntry } from './MealItem';
import type { NutrientTotals } from './NutrientTotals';

export function AggregateMealEntries(entries: LoggedMealEntry[]): NutrientTotals {
  return entries.reduce<NutrientTotals>(
    (totals, entry) => ({
      calories: totals.calories + entry.calories,
      proteinG: totals.proteinG + entry.proteinG,
      carbsG: totals.carbsG + entry.carbsG,
      fatG: totals.fatG + entry.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
