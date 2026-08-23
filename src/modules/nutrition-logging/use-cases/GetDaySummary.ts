import { AggregateMealEntries } from '../domain/AggregateMealEntries';
import { ComputeDayNutrientProgress, type DayNutrientProgress } from '../domain/ComputeDayNutrientProgress';
import type { MealItem } from '../domain/MealItem';
import type { NutrientTotals } from '../domain/NutrientTotals';
import type { DailyTargetsPort } from '../ports/DailyTargetsPort';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

export interface GetDaySummaryInput {
  userId: string;
  date: Date;
}

export interface DaySummary {
  userId: string;
  date: Date;
  mealItems: MealItem[];
  consumed: NutrientTotals;
  dailyCalorieGoal: number | null;
  dailyProteinGoal: number | null;
  dailyCarbsGoal: number | null;
  dailyFatGoal: number | null;
  remainingCalories: number | null;
  progress: DayNutrientProgress;
}

export class GetDaySummary {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly dailyTargetsPort: DailyTargetsPort,
  ) {}

  async execute(input: GetDaySummaryInput): Promise<DaySummary> {
    const mealItems = await this.repository.findByUserIdAndDate(input.userId, input.date);
    const consumed = AggregateMealEntries(mealItems.flatMap((mealItem) => mealItem.entries));
    const dailyTargets = await this.dailyTargetsPort.getDailyTargets(input.userId);
    const progress = ComputeDayNutrientProgress(consumed, dailyTargets);

    return {
      userId: input.userId,
      date: input.date,
      mealItems,
      consumed,
      dailyCalorieGoal: progress.calories.goal,
      dailyProteinGoal: progress.protein.goal,
      dailyCarbsGoal: progress.carbs.goal,
      dailyFatGoal: progress.fat.goal,
      remainingCalories: progress.calories.remaining,
      progress,
    };
  }
}
