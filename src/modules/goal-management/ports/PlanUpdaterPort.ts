import type { Goal } from '../../../shared/domain/PlanCalculationService';

export interface UpdateGoalChanges {
  weightKg?: number;
  workoutsPerWeek?: number;
  goal?: Goal;
  weeklyPaceKg?: number;
}

export interface GoalPlan {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanUpdaterPort {
  update(userId: string, changes: UpdateGoalChanges): Promise<GoalPlan>;
}
