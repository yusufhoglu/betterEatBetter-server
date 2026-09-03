import { AggregateMealEntries } from '../domain/AggregateMealEntries';
import { ComputeDayNutrientProgress, type DayNutrientProgress } from '../domain/ComputeDayNutrientProgress';
import type { MealType } from '../domain/MealItem';
import type { NutrientTotals } from '../domain/NutrientTotals';
import type { DailyTargetsPort } from '../ports/DailyTargetsPort';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

export interface GetDayNutrientTotalsInput {
  userId: string;
  date: Date;
}

export interface DayNutrientTotals {
  date: Date;
  consumed: NutrientTotals;
  targets: NutrientTotals | null;
  remainingCalories: number | null;
  loggedMealTypes: MealType[];
  progress: DayNutrientProgress;
}

/**
 * The lightweight sibling of {@link GetDaySummary}: the day's consumed totals,
 * targets and remaining calories — WITHOUT the per-meal photo/presigned-URL
 * enrichment `GetDaySummary` does. Cheap enough to call on every dietician turn
 * as eager context.
 */
export class GetDayNutrientTotals {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly dailyTargetsPort: DailyTargetsPort,
  ) {}

  async execute(input: GetDayNutrientTotalsInput): Promise<DayNutrientTotals> {
    const mealItems = await this.repository.findByUserIdAndDate(input.userId, input.date);
    const consumed = AggregateMealEntries(mealItems.flatMap((mealItem) => mealItem.entries));
    const targets = await this.dailyTargetsPort.getDailyTargets(input.userId);
    const progress = ComputeDayNutrientProgress(consumed, targets);
    const loggedMealTypes = [...new Set(mealItems.map((mealItem) => mealItem.mealType))];

    return {
      date: input.date,
      consumed,
      targets,
      remainingCalories: progress.calories.remaining,
      loggedMealTypes,
      progress,
    };
  }
}
