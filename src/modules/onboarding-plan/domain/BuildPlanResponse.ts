import { computeBodyComposition } from '../../../shared/domain/PlanCalculationService';
import type { Plan } from '../ports/PlanRepositoryPort';
import type { UserProfile } from '../ports/UserProfileRepositoryPort';
import { ComputeHealthScore } from './ComputeHealthScore';
import { ComputeWeightProjection, type WeightProjection } from './ComputeWeightProjection';

export interface EnrichedPlan extends Plan {
  projection: WeightProjection;
  healthScore: number;
  /** Body-fat estimate the macro split was built on — Navy if the user gave tape
   * measurements at onboarding, otherwise a Deurenberg (BMI-based) estimate. */
  bodyFatPct: number;
  leanBodyMassKg: number;
  /** shoulder ÷ waist circumference — only when the user measured both; not used
   * for the plan, surfaced for display. */
  shoulderToWaistRatio: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function BuildPlanResponse(profile: UserProfile, plan: Plan, referenceDate?: Date): EnrichedPlan {
  const composition = computeBodyComposition({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    gender: profile.gender,
    waistCm: profile.waistCm,
    neckCm: profile.neckCm,
    hipCm: profile.hipCm,
  });

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
    bodyFatPct: composition.bodyFatPct,
    leanBodyMassKg: composition.leanBodyMassKg,
    shoulderToWaistRatio:
      profile.shoulderCm && profile.waistCm ? round2(profile.shoulderCm / profile.waistCm) : null,
  };
}
