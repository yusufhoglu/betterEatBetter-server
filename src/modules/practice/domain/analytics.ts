/**
 * Pure client analytics for the dietitian panel: the adherence score, period
 * summaries, weight progress. No I/O — use-cases feed it day series built from
 * the owning modules' data. All dates are YYYY-MM-DD calendar days.
 */

export interface DayRecord {
  date: string;
  /** At least one meal entry that day. */
  logged: boolean;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealTypes: string[];
  /** null = no water row that day (or water not shared). */
  waterMl: number | null;
  /** null = no step data that day (or steps not shared). */
  steps: number | null;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  steps: number;
}

export interface WeightPoint {
  date: string;
  kg: number;
}

export type ScorePartId = 'logging' | 'calories' | 'protein' | 'water' | 'steps';

export interface ScorePart {
  id: ScorePartId;
  weight: number;
  hits: number;
  days: number;
  /** hits / days, 0–1. */
  ratio: number;
}

export interface AdherenceScore {
  /** 0–100, or null when there is nothing to score yet. */
  score: number | null;
  parts: ScorePart[];
}

/** Which data the client shares — analytics never uses anything else. */
export interface SharedData {
  meals: boolean;
  water: boolean;
  steps: boolean;
  body: boolean;
}

// Weights agreed with the product owner (2026-09-28).
const PART_WEIGHTS: Record<ScorePartId, number> = { logging: 30, calories: 30, protein: 20, water: 10, steps: 10 };
const KCAL_TOLERANCE = 0.1;
const PROTEIN_HIT_RATIO = 0.9;
const WATER_HIT_RATIO = 0.9;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function addDays(day: string, delta: number): string {
  return isoDay(new Date(parseDay(day).getTime() + delta * DAY_MS));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS);
}

function isWeekend(day: string): boolean {
  const dow = parseDay(day).getUTCDay();
  return dow === 0 || dow === 6;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Score over COMPLETE days only (today is still in progress). A part whose
 * data isn't shared, or has no target, drops out and the remaining weights
 * are renormalised — a client who doesn't share water isn't penalised for it.
 */
export function computeAdherenceScore(completeDays: DayRecord[], targets: Targets | null, shared: SharedData): AdherenceScore {
  const n = completeDays.length;
  const parts: ScorePart[] = [];
  const add = (id: ScorePartId, hit: (d: DayRecord) => boolean) => {
    const hits = completeDays.filter(hit).length;
    parts.push({ id, weight: PART_WEIGHTS[id], hits, days: n, ratio: n ? hits / n : 0 });
  };

  if (shared.meals) {
    add('logging', (d) => d.logged);
    if (targets) {
      add('calories', (d) => d.logged && Math.abs(d.kcal - targets.kcal) / targets.kcal <= KCAL_TOLERANCE);
      add('protein', (d) => d.logged && d.proteinG >= targets.proteinG * PROTEIN_HIT_RATIO);
    }
  }
  if (shared.water && targets) {
    add('water', (d) => d.waterMl !== null && d.waterMl >= targets.waterMl * WATER_HIT_RATIO);
  }
  if (shared.steps && targets) {
    add('steps', (d) => d.steps !== null && d.steps >= targets.steps);
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (n === 0 || totalWeight === 0) {
    return { score: null, parts };
  }
  const score = Math.round((parts.reduce((s, p) => s + p.weight * p.ratio, 0) / totalWeight) * 100);
  return { score, parts };
}

export interface NutritionSummary {
  loggedDays: number;
  avgKcal: number | null;
  avgProteinG: number | null;
  avgCarbsG: number | null;
  avgFatG: number | null;
  daysInKcalRange: number;
  weekdayAvgKcal: number | null;
  weekendAvgKcal: number | null;
}

export function summarizeNutrition(days: DayRecord[], targets: Targets | null): NutritionSummary {
  const logged = days.filter((d) => d.logged);
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  return {
    loggedDays: logged.length,
    avgKcal: round(average(logged.map((d) => d.kcal))),
    avgProteinG: round(average(logged.map((d) => d.proteinG))),
    avgCarbsG: round(average(logged.map((d) => d.carbsG))),
    avgFatG: round(average(logged.map((d) => d.fatG))),
    daysInKcalRange: targets
      ? logged.filter((d) => Math.abs(d.kcal - targets.kcal) / targets.kcal <= KCAL_TOLERANCE).length
      : 0,
    weekdayAvgKcal: round(average(logged.filter((d) => !isWeekend(d.date)).map((d) => d.kcal))),
    weekendAvgKcal: round(average(logged.filter((d) => isWeekend(d.date)).map((d) => d.kcal))),
  };
}

export interface ActivitySummary {
  avgSteps: number | null;
  stepGoalDays: number;
  bestDay: { date: string; steps: number } | null;
  avgWaterMl: number | null;
  waterGoalDays: number;
}

export function summarizeActivity(days: DayRecord[], targets: Targets | null): ActivitySummary {
  const stepDays = days.filter((d) => d.steps !== null);
  const waterDays = days.filter((d) => d.waterMl !== null);
  const best = stepDays.reduce<DayRecord | null>((b, d) => (!b || d.steps! > b.steps! ? d : b), null);
  const avgSteps = average(stepDays.map((d) => d.steps!));
  const avgWater = average(waterDays.map((d) => d.waterMl!));
  return {
    avgSteps: avgSteps === null ? null : Math.round(avgSteps),
    stepGoalDays: targets ? stepDays.filter((d) => d.steps! >= targets.steps).length : 0,
    bestDay: best ? { date: best.date, steps: best.steps! } : null,
    avgWaterMl: avgWater === null ? null : Math.round(avgWater),
    waterGoalDays: targets ? waterDays.filter((d) => d.waterMl! >= targets.waterMl * WATER_HIT_RATIO).length : 0,
  };
}

export interface FoodTotal {
  name: string;
  kcal: number;
  count: number;
}

/** Foods ranked by total calories contributed; names are grouped case-insensitively. */
export function topFoods(entries: Array<{ name: string; calories: number }>, limit = 5): FoodTotal[] {
  const byName = new Map<string, FoodTotal>();
  for (const entry of entries) {
    const key = entry.name.trim().toLocaleLowerCase('tr');
    if (!key) continue;
    const total = byName.get(key) ?? { name: entry.name.trim(), kcal: 0, count: 0 };
    total.kcal += entry.calories;
    total.count += 1;
    byName.set(key, total);
  }
  return [...byName.values()]
    .map((f) => ({ ...f, kcal: Math.round(f.kcal) }))
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit);
}

export interface WeightProgress {
  startKg: number | null;
  latestKg: number | null;
  latestDate: string | null;
  changeKg: number | null;
  /** kg per week over (up to) the last 4 weeks; negative = losing. */
  weeklyRateKg: number | null;
  targetKg: number | null;
  remainingKg: number | null;
  /** Projected date the target is reached at the current rate, if moving toward it. */
  projectedTargetDate: string | null;
}

export function computeWeightProgress(weights: WeightPoint[], targetKg: number | null, today: string): WeightProgress {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;
  if (!first || !latest) {
    return { startKg: null, latestKg: null, latestDate: null, changeKg: null, weeklyRateKg: null, targetKg, remainingKg: null, projectedTargetDate: null };
  }

  const windowStart = addDays(latest.date, -28);
  const reference = sorted.find((w) => w.date >= windowStart) ?? first;
  const spanDays = daysBetween(reference.date, latest.date);
  const weeklyRateKg = spanDays >= 7 ? round2(((latest.kg - reference.kg) / spanDays) * 7) : null;
  const remainingKg = targetKg === null ? null : round2(Math.abs(latest.kg - targetKg));

  let projectedTargetDate: string | null = null;
  if (targetKg !== null && weeklyRateKg !== null && weeklyRateKg !== 0 && remainingKg! > 0) {
    const movingToward = (targetKg - latest.kg) * weeklyRateKg > 0;
    if (movingToward) {
      const weeks = remainingKg! / Math.abs(weeklyRateKg);
      if (weeks <= 104) projectedTargetDate = addDays(today, Math.round(weeks * 7));
    }
  }

  return {
    startKg: first.kg,
    latestKg: latest.kg,
    latestDate: latest.date,
    changeKg: round2(latest.kg - first.kg),
    weeklyRateKg,
    targetKg,
    remainingKg,
    projectedTargetDate,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
