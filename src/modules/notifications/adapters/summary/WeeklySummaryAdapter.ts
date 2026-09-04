import type { GetMealAverages } from '../../../body-analytics/use-cases/GetMealAverages';
import type { GetTodayStatus } from '../../../daily-tracking/use-cases/GetTodayStatus';
import type { GetWeekProgress } from '../../../daily-tracking/use-cases/GetWeekProgress';
import type { WeeklySummary, WeeklySummaryPort } from '../../ports/WeeklySummaryPort';

function startOfUtcDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Composes the weekly-report facts from `daily-tracking` (streak + last-7-day
 * completion) and `body-analytics` (mean daily calories) — the notifications
 * module never re-reads the meal / tracking tables itself.
 */
export class WeeklySummaryAdapter implements WeeklySummaryPort {
  constructor(
    private readonly getTodayStatus: GetTodayStatus,
    private readonly getWeekProgress: GetWeekProgress,
    private readonly getMealAverages: GetMealAverages,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getForUser(userId: string): Promise<WeeklySummary> {
    const weekStartDate = addUtcDays(startOfUtcDay(this.now()), -6);

    const [today, weekProgress, mealAverages] = await Promise.all([
      this.getTodayStatus.execute({ userId }),
      this.getWeekProgress.execute({ userId, weekStartDate }),
      this.getMealAverages.execute(userId, 'week'),
    ]);

    const daysCompleted = [...weekProgress.values()].filter(Boolean).length;

    return {
      daysCompleted,
      currentStreak: today.currentStreak,
      avgCalories: mealAverages.caloriesAvg,
    };
  }
}
