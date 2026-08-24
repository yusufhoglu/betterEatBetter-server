import type { Goal } from '../../../shared/domain/PlanCalculationService';

export interface ComputeHealthScoreInput {
  weightKg: number;
  targetWeightKg: number;
  heightCm: number;
  age: number;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Heuristic, deterministic score for onboarding UX. It intentionally stays
 * coarse-grained so the API can expose a stable signal without over-claiming
 * medical precision.
 */
export function ComputeHealthScore(input: ComputeHealthScoreInput): number {
  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  const bmiPenalty = bmi < 18.5 ? (18.5 - bmi) * 4 : bmi > 25 ? (bmi - 25) * 3 : 0;
  const workoutBonus = clamp(input.workoutsPerWeek, 0, 5) * 3;
  const pacePenalty = input.goal === 'maintain' ? 0 : Math.max(0, input.weeklyPaceKg - 0.75) * 16;
  const goalDistancePenalty = Math.max(0, Math.abs(input.weightKg - input.targetWeightKg) - 12) * 0.8;
  const agePenalty = Math.max(0, input.age - 45) * 0.15;

  return Math.round(clamp(82 - bmiPenalty - pacePenalty - goalDistancePenalty - agePenalty + workoutBonus, 1, 100));
}
