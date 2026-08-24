import { resolveDateRange } from '../domain/resolveDateRange';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import { sumEntries } from './bodyAnalyticsShared';

const mealSlots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export class GetMealBreakdown {
  constructor(private readonly repository: MealLogReadModelPort) {}

  async execute(userId: string, range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime') {
    const { startDate, endDate } = resolveDateRange(range);
    const logs = await this.repository.listForRange(userId, startDate, endDate);

    return mealSlots
      .map((mealSlot) => {
        const totals = sumEntries(logs.filter((log) => log.mealType === mealSlot));
        return {
          mealSlot,
          calories: Math.round(totals.calories),
          proteinG: Math.round(totals.proteinG),
          carbsG: Math.round(totals.carbsG),
          fatG: Math.round(totals.fatG),
        };
      })
      .filter((row) => row.calories > 0 || row.proteinG > 0 || row.carbsG > 0 || row.fatG > 0);
  }
}
