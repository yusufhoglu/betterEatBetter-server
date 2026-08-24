import type { Plan } from '../ports/PlanRepositoryPort';
import type { UserProfile } from '../ports/UserProfileRepositoryPort';
import { ComputeHealthScore } from './ComputeHealthScore';
import { ComputeWeightProjection, type WeightProjection } from './ComputeWeightProjection';

export interface EnrichedPlan extends Plan {
  projection: WeightProjection;
  healthScore: number;
}

export function BuildPlanResponse(profile: UserProfile, plan: Plan, referenceDate?: Date): EnrichedPlan {
  return {
    ...plan,
    projection: ComputeWeightProjection({
      startWeightKg: profile.weightKg,
      targetWeightKg: profile.targetWeightKg,
      goal: profile.goal,
      weeklyPaceKg: profile.weeklyPaceKg,
      referenceDate,
    }),
    healthScore: ComputeHealthScore({
      weightKg: profile.weightKg,
      targetWeightKg: profile.targetWeightKg,
      heightCm: profile.heightCm,
      age: profile.age,
      workoutsPerWeek: profile.workoutsPerWeek,
      goal: profile.goal,
      weeklyPaceKg: profile.weeklyPaceKg,
    }),
  };
}
