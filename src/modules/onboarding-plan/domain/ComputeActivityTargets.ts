/**
 * Automatic daily water and step targets, used whenever the plan carries no
 * explicit override (Plan.waterTargetMl / Plan.stepTarget = null).
 *
 * - Water: 33 ml per kg of current body weight, clamped to 1.5–3.5 L and
 *   rounded to 100 ml — recomputes on its own as the user weighs in.
 * - Steps: by self-reported training frequency (onboarding workoutsPerWeek).
 */

const WATER_ML_PER_KG = 33;
const MIN_WATER_ML = 1500;
const MAX_WATER_ML = 3500;

export const WATER_TARGET_RANGE = { min: 500, max: 6000 } as const;
export const STEP_TARGET_RANGE = { min: 1000, max: 40000 } as const;

export function autoWaterTargetMl(weightKg: number): number {
  const raw = Math.min(MAX_WATER_ML, Math.max(MIN_WATER_ML, weightKg * WATER_ML_PER_KG));
  return Math.round(raw / 100) * 100;
}

export function autoStepTarget(workoutsPerWeek: number): number {
  if (workoutsPerWeek >= 5) return 10000;
  if (workoutsPerWeek >= 2) return 8000;
  return 7000;
}

export interface ActivityTargets {
  waterMl: number;
  steps: number;
  waterAuto: boolean;
  stepsAuto: boolean;
}

export function ComputeActivityTargets(
  profile: { weightKg: number; workoutsPerWeek: number },
  overrides: { waterTargetMl?: number | null; stepTarget?: number | null },
): ActivityTargets {
  const waterAuto = overrides.waterTargetMl == null;
  const stepsAuto = overrides.stepTarget == null;
  return {
    waterMl: waterAuto ? autoWaterTargetMl(profile.weightKg) : overrides.waterTargetMl!,
    steps: stepsAuto ? autoStepTarget(profile.workoutsPerWeek) : overrides.stepTarget!,
    waterAuto,
    stepsAuto,
  };
}
