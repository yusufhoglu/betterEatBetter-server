import type { Goal } from '../../../shared/domain/PlanCalculationService';

export interface WeightProjection {
  startWeightKg: number;
  targetWeightKg: number;
  estimatedTargetDate: Date | null;
}

export interface ComputeWeightProjectionInput {
  startWeightKg: number;
  targetWeightKg: number;
  goal: Goal;
  weeklyPaceKg: number;
  referenceDate?: Date;
}

const DAYS_PER_WEEK = 7;

function normalizeToStartOfUtcDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function ComputeWeightProjection(input: ComputeWeightProjectionInput): WeightProjection {
  const referenceDate = normalizeToStartOfUtcDay(input.referenceDate ?? new Date());
  const deltaKg = Math.abs(input.targetWeightKg - input.startWeightKg);

  if (input.goal === 'maintain' || deltaKg === 0 || input.weeklyPaceKg <= 0) {
    return {
      startWeightKg: input.startWeightKg,
      targetWeightKg: input.targetWeightKg,
      estimatedTargetDate: null,
    };
  }

  const weeksToGoal = Math.ceil(deltaKg / input.weeklyPaceKg);
  const estimatedTargetDate = new Date(referenceDate);
  estimatedTargetDate.setUTCDate(estimatedTargetDate.getUTCDate() + weeksToGoal * DAYS_PER_WEEK);

  return {
    startWeightKg: input.startWeightKg,
    targetWeightKg: input.targetWeightKg,
    estimatedTargetDate,
  };
}
