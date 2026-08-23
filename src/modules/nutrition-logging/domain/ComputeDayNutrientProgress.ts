import { ComputeCaloriesRemaining } from './ComputeCaloriesRemaining';
import type { NutrientTotals } from './NutrientTotals';

export interface NutrientProgress {
  consumed: number;
  goal: number | null;
  remaining: number | null;
}

export interface DayNutrientProgress {
  calories: NutrientProgress;
  protein: NutrientProgress;
  carbs: NutrientProgress;
  fat: NutrientProgress;
}

export function ComputeDayNutrientProgress(
  consumed: NutrientTotals,
  dailyTargets: NutrientTotals | null,
): DayNutrientProgress {
  return {
    calories: {
      consumed: consumed.calories,
      goal: dailyTargets?.calories ?? null,
      remaining: ComputeCaloriesRemaining(dailyTargets?.calories ?? null, consumed.calories),
    },
    protein: {
      consumed: consumed.proteinG,
      goal: dailyTargets?.proteinG ?? null,
      remaining: ComputeCaloriesRemaining(dailyTargets?.proteinG ?? null, consumed.proteinG),
    },
    carbs: {
      consumed: consumed.carbsG,
      goal: dailyTargets?.carbsG ?? null,
      remaining: ComputeCaloriesRemaining(dailyTargets?.carbsG ?? null, consumed.carbsG),
    },
    fat: {
      consumed: consumed.fatG,
      goal: dailyTargets?.fatG ?? null,
      remaining: ComputeCaloriesRemaining(dailyTargets?.fatG ?? null, consumed.fatG),
    },
  };
}
