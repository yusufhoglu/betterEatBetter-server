export type Gender = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

const KCAL_PER_KG_FAT = 7700;
const MIN_DAILY_CALORIES = 1200;
const MAX_WEEKLY_PACE_KG = 1;

export interface ComputeBMRInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}

/** Mifflin-St Jeor formula. */
export function computeBMR(input: ComputeBMRInput): number {
  const { weightKg, heightCm, age, gender } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'male' ? base + 5 : base - 161;
}

export function computeTDEE(bmr: number, workoutsPerWeek: number): number {
  let activityMultiplier: number;
  if (workoutsPerWeek === 0) {
    activityMultiplier = 1.2;
  } else if (workoutsPerWeek <= 3) {
    activityMultiplier = 1.375;
  } else if (workoutsPerWeek <= 5) {
    activityMultiplier = 1.55;
  } else if (workoutsPerWeek <= 7) {
    activityMultiplier = 1.725;
  } else {
    activityMultiplier = 1.9;
  }
  return bmr * activityMultiplier;
}

export function computeDailyCalorieTarget(tdee: number, goal: Goal, weeklyPaceKg: number): number {
  const clampedPaceKg = Math.min(Math.abs(weeklyPaceKg), MAX_WEEKLY_PACE_KG);
  const dailyDelta = (clampedPaceKg * KCAL_PER_KG_FAT) / 7;

  let target: number;
  if (goal === 'lose') {
    target = tdee - dailyDelta;
  } else if (goal === 'gain') {
    target = tdee + dailyDelta;
  } else {
    target = tdee;
  }

  return Math.round(Math.max(target, MIN_DAILY_CALORIES));
}

export interface MacroSplit {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computeMacroSplit(dailyCalories: number, weightKg: number): MacroSplit {
  const proteinG = Math.round(2 * weightKg);
  const proteinKcal = proteinG * 4;
  const remainingKcal = Math.max(dailyCalories - proteinKcal, 0);

  return {
    proteinG,
    carbsG: Math.round((remainingKcal * 0.5) / 4),
    fatG: Math.round((remainingKcal * 0.5) / 9),
  };
}

export interface ComputePlanInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
}

export interface ComputedPlan {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function computePlan(input: ComputePlanInput): ComputedPlan {
  const bmr = computeBMR(input);
  const tdee = computeTDEE(bmr, input.workoutsPerWeek);
  const dailyCalories = computeDailyCalorieTarget(tdee, input.goal, input.weeklyPaceKg);
  const macros = computeMacroSplit(dailyCalories, input.weightKg);

  return { dailyCalories, ...macros };
}
