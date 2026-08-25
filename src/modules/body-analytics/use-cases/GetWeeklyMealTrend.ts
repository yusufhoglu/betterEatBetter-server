import { resolveDateRange } from '../domain/resolveDateRange';
import { sumEntries, toDateKey } from './bodyAnalyticsShared';
import type { MealAnalyticsMetric } from '../domain/bodyAnalyticsTypes';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import type { PlanTargetPort } from '../ports/PlanTargetPort';
import { sumEntryMetric } from './bodyAnalyticsShared';

const orderedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const FALLBACK_DAILY_TARGETS = {
  calories: 2100,
  proteinG: 130,
  carbsG: 210,
  fatG: 70,
  fiberG: 30,
} as const;

function deriveFiberTarget(dailyCalories: number): number {
  return Math.max(25, Math.round((dailyCalories / 1000) * 14));
}

function resolveFallbackTarget(metric: MealAnalyticsMetric, logs: Awaited<ReturnType<MealLogReadModelPort['listForRange']>>): number {
  const dayCount = new Set(logs.map((log) => toDateKey(log.date))).size;
  if (dayCount === 0) {
    return FALLBACK_DAILY_TARGETS[metric];
  }

  const totals = sumEntries(logs);
  const perDay =
    metric === 'calories'
      ? totals.calories / dayCount
      : metric === 'proteinG'
        ? totals.proteinG / dayCount
        : metric === 'carbsG'
          ? totals.carbsG / dayCount
          : metric === 'fatG'
            ? totals.fatG / dayCount
            : totals.fiberG / dayCount;

  return Math.max(1, Math.round(perDay));
}

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

    const target =
      plan === null
        ? resolveFallbackTarget(metric, logs)
        : metric === 'calories'
          ? Math.round(plan.dailyCalories)
          : metric === 'proteinG'
            ? Math.round(plan.proteinG)
            : metric === 'carbsG'
              ? Math.round(plan.carbsG)
              : metric === 'fatG'
                ? Math.round(plan.fatG)
                : deriveFiberTarget(plan.dailyCalories);

    return {
      days: [...orderedDays],
      actual: orderedDays.map((day) => Math.round(totalsByDay.get(day) ?? 0)),
      target,
      targetSeries: orderedDays.map(() => target),
    };
  }
}
