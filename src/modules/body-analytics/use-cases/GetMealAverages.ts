import { resolveDateRange } from '../domain/resolveDateRange';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import { sumEntries, toDateKey } from './bodyAnalyticsShared';

export class GetMealAverages {
  constructor(private readonly repository: MealLogReadModelPort) {}

  async execute(userId: string, range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime') {
    const { startDate, endDate } = resolveDateRange(range);
    const logs = await this.repository.listForRange(userId, startDate, endDate);
    const dayCount = new Set(logs.map((log) => toDateKey(log.date))).size || 1;
    const totals = sumEntries(logs);

    return {
      caloriesAvg: Math.round(totals.calories / dayCount),
      proteinAvgG: Math.round(totals.proteinG / dayCount),
      carbsAvgG: Math.round(totals.carbsG / dayCount),
      fiberAvgG: Math.round(totals.fiberG / dayCount),
    };
  }
}
