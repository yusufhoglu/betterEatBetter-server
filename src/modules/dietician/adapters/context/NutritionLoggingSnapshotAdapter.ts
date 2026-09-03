import type { GetDayNutrientTotals } from '../../../nutrition-logging/use-cases/GetDayNutrientTotals';
import type { DailySnapshot } from '../../domain/dieticianContext';
import type { DailySnapshotPort } from '../../ports/DailySnapshotPort';

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Bridges to nutrition-logging's lightweight GetDayNutrientTotals use-case. */
export class NutritionLoggingSnapshotAdapter implements DailySnapshotPort {
  constructor(private readonly getDayNutrientTotals: GetDayNutrientTotals) {}

  async getTodaySnapshot(userId: string, date: Date): Promise<DailySnapshot | null> {
    const totals = await this.getDayNutrientTotals.execute({ userId, date });

    return {
      date: toDateKey(date),
      consumedCalories: totals.consumed.calories,
      remainingCalories: totals.remainingCalories,
      loggedMealTypes: totals.loggedMealTypes,
    };
  }
}
