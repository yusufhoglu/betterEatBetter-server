import { resolveDateRange } from '../domain/resolveDateRange';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';

export class GetTopFoods {
  constructor(private readonly repository: MealLogReadModelPort) {}

  async execute(userId: string, range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime') {
    const { startDate, endDate } = resolveDateRange(range);
    const logs = await this.repository.listForRange(userId, startDate, endDate);
    const counts = new Map<string, { name: string; logCount: number; mealSlot: string }>();

    for (const log of logs) {
      for (const entry of log.entries) {
        const key = `${entry.name}:${log.mealType}`;
        const current = counts.get(key) ?? { name: entry.name, logCount: 0, mealSlot: log.mealType };
        current.logCount += 1;
        counts.set(key, current);
      }
    }

    return [...counts.values()].sort((left, right) => right.logCount - left.logCount).slice(0, 10);
  }
}
