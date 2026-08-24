import type { Goal } from '../../../shared/domain/PlanCalculationService';

export interface UpdateGoalChanges {
  weightKg?: number;
  targetWeightKg?: number | null;
  workoutsPerWeek?: number;
  goal?: Goal;
  weeklyPaceKg?: number;
  dailyCalories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export interface GoalPlan {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdAt: Date;
  updatedAt: Date;
  projection: {
    startWeightKg: number;
    targetWeightKg: number;
    estimatedTargetDate: Date | null;
  };
  healthScore: number;
}

export interface PlanUpdaterPort {
  update(userId: string, changes: UpdateGoalChanges): Promise<GoalPlan>;
}
