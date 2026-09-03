export type Gender = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

const KCAL_PER_KG_FAT = 7700;
const MIN_DAILY_CALORIES = 1200;
const MAX_WEEKLY_PACE_KG = 1;
const MIN_BODY_FAT_PCT = 5;
const MAX_BODY_FAT_PCT = 60;
const CM_PER_IN = 2.54;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── Body composition ────────────────────────────────────────────────────────

/**
 * Deurenberg (1991) BMI-based body-fat estimate — needs no tape measurements, so
 * it is always available. `S` is 1 for male, 0 for female. Result clamped to a
 * plausible [5, 60] % band.
 */
export function computeDeurenbergBodyFatPct(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}): number {
  const bmi = input.weightKg / (input.heightCm / 100) ** 2;
  const sex = input.gender === 'male' ? 1 : 0;
  const raw = 1.2 * bmi + 0.23 * input.age - 10.8 * sex - 5.4;
  return clampNumber(raw, MIN_BODY_FAT_PCT, MAX_BODY_FAT_PCT);
}

/**
 * US-Navy circumference body-fat estimate (inputs in cm), or `null` when the
 * measurements are missing or geometrically invalid (a log of a non-positive
 * number). Needs waist + neck for men, plus hip for women.
 */
export function computeNavyBodyFatPct(input: {
  heightCm: number;
  gender: Gender;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
}): number | null {
  const heightIn = input.heightCm / CM_PER_IN;
  const waistIn = (input.waistCm ?? 0) / CM_PER_IN;
  const neckIn = (input.neckCm ?? 0) / CM_PER_IN;
  const hipIn = (input.hipCm ?? 0) / CM_PER_IN;

  if (input.heightCm <= 0 || waistIn <= 0 || neckIn <= 0) return null;

  let raw: number;
  if (input.gender === 'male') {
    if (waistIn - neckIn <= 0) return null;
    raw = 86.01 * Math.log10(waistIn - neckIn) - 70.041 * Math.log10(heightIn) + 36.76;
  } else {
    if (hipIn <= 0 || waistIn + hipIn - neckIn <= 0) return null;
    raw = 163.205 * Math.log10(waistIn + hipIn - neckIn) - 97.684 * Math.log10(heightIn) - 78.387;
  }

  if (!Number.isFinite(raw)) return null;
  return clampNumber(raw, MIN_BODY_FAT_PCT, MAX_BODY_FAT_PCT);
}

export interface BodyComposition {
  bodyFatPct: number;
  leanBodyMassKg: number;
  /** true when bodyFatPct came from the Navy tape measurements, not Deurenberg. */
  fromMeasurements: boolean;
}

/**
 * Resolves a single body-fat figure: the Navy estimate when valid measurements
 * were supplied, otherwise the Deurenberg fallback. Lean body mass follows.
 */
export function computeBodyComposition(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
}): BodyComposition {
  const navy = computeNavyBodyFatPct(input);
  const bodyFatPct = navy ?? computeDeurenbergBodyFatPct(input);
  const leanBodyMassKg = input.weightKg * (1 - bodyFatPct / 100);
  return {
    bodyFatPct: round1(bodyFatPct),
    leanBodyMassKg: round1(leanBodyMassKg),
    fromMeasurements: navy !== null,
  };
}

// ── Energy ──────────────────────────────────────────────────────────────────

export interface ComputeBMRInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  /**
   * When supplied, BMR uses the Katch-McArdle formula (body-composition based)
   * instead of Mifflin-St Jeor. Only pass this when the lean mass is derived
   * from real measurements, not from a BMI-based body-fat estimate.
   */
  leanBodyMassKg?: number;
}

/** Mifflin-St Jeor, or Katch-McArdle when `leanBodyMassKg` is supplied. */
export function computeBMR(input: ComputeBMRInput): number {
  if (input.leanBodyMassKg !== undefined) {
    return 370 + 21.6 * input.leanBodyMassKg;
  }
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

// ── Macros ──────────────────────────────────────────────────────────────────

export interface MacroSplit {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Protein is scaled from lean body mass when `leanBodyMassKg` is known — 2.0 g/kg
 * LBM, bounded to 1.6–2.2 g/kg of bodyweight so it stays sensible at the
 * extremes — otherwise it falls back to a flat 2.0 g/kg of bodyweight. Fat is
 * held at a 0.8 g/kg bodyweight floor for hormonal health (or 25% of calories,
 * whichever is higher). Carbs take whatever calories remain.
 */
export function computeMacroSplit(
  dailyCalories: number,
  weightKg: number,
  leanBodyMassKg?: number,
): MacroSplit {
  const proteinG =
    leanBodyMassKg !== undefined
      ? Math.round(clampNumber(2.0 * leanBodyMassKg, 1.6 * weightKg, 2.2 * weightKg))
      : Math.round(2.0 * weightKg);

  const fatG = Math.round(Math.max((dailyCalories * 0.25) / 9, 0.8 * weightKg));

  const remainingKcal = Math.max(dailyCalories - proteinG * 4 - fatG * 9, 0);

  return {
    proteinG,
    carbsG: Math.round(remainingKcal / 4),
    fatG,
  };
}

// ── Whole plan ──────────────────────────────────────────────────────────────

export interface ComputePlanInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
}

export interface ComputedPlan {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  bodyFatPct: number;
  leanBodyMassKg: number;
}

export function computePlan(input: ComputePlanInput): ComputedPlan {
  const composition = computeBodyComposition(input);
  const bmr = computeBMR({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age: input.age,
    gender: input.gender,
    leanBodyMassKg: composition.fromMeasurements ? composition.leanBodyMassKg : undefined,
  });
  const tdee = computeTDEE(bmr, input.workoutsPerWeek);
  const dailyCalories = computeDailyCalorieTarget(tdee, input.goal, input.weeklyPaceKg);
  const macros = computeMacroSplit(dailyCalories, input.weightKg, composition.leanBodyMassKg);

  return {
    dailyCalories,
    ...macros,
    bodyFatPct: composition.bodyFatPct,
    leanBodyMassKg: composition.leanBodyMassKg,
  };
}
