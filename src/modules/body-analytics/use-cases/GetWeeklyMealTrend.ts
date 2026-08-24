import { resolveDateRange } from '../domain/resolveDateRange';
import type { MealAnalyticsMetric } from '../domain/bodyAnalyticsTypes';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import type { PlanTargetPort } from '../ports/PlanTargetPort';
import { sumEntryMetric } from './bodyAnalyticsShared';

const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export class GetWeeklyMealTrend {
  constructor(
    private readonly repository: MealLogReadModelPort,
    private readonly planTargetPort: PlanTargetPort,
  ) {}

  async execute(userId: string, metric: MealAnalyticsMetric, range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime') {
    const { startDate, endDate } = resolveDateRange(range);
    const [logs, plan] = await Promise.all([
      this.repository.listForRange(userId, startDate, endDate),
      this.planTargetPort.getPlanTargets(userId),
    ]);

    const totalsByDay = new Map<string, number>(orderedDays.map((day) => [day, 0]));
    for (const log of logs) {
      const weekday = orderedDays[(log.date.getUTCDay() + 6) % 7]!;
      totalsByDay.set(weekday, (totalsByDay.get(weekday) ?? 0) + sumEntryMetric(log.entries, metric));
    }

    return {
      days: [...orderedDays],
      actual: orderedDays.map((day) => Math.round(totalsByDay.get(day) ?? 0)),
      target:
        metric === 'calories'
          ? plan?.dailyCalories ?? 0
          : metric === 'proteinG'
            ? plan?.proteinG ?? 0
            : metric === 'carbsG'
              ? plan?.carbsG ?? 0
              : metric === 'fatG'
                ? plan?.fatG ?? 0
                : 0,
    };
  }
}
