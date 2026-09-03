import type { DailySnapshot, PlanContext } from '../../domain/dieticianContext';
import type { DailySnapshotPort } from '../../ports/DailySnapshotPort';
import type { PlanContextPort } from '../../ports/PlanContextPort';

export const SAMPLE_PLAN_CONTEXT: PlanContext = {
  goal: 'lose',
  dailyCalories: 1800,
  proteinG: 140,
  carbsG: 160,
  fatG: 60,
  currentWeightKg: 82,
  targetWeightKg: 75,
  workoutsPerWeek: 3,
  age: 31,
  gender: 'male',
};

export const SAMPLE_SNAPSHOT: DailySnapshot = {
  date: '2026-09-03',
  consumedCalories: 1200,
  remainingCalories: 600,
  loggedMealTypes: ['breakfast', 'lunch'],
};

export class FakePlanContextPort implements PlanContextPort {
  constructor(private value: PlanContext | null = SAMPLE_PLAN_CONTEXT) {}
  setValue(value: PlanContext | null): void {
    this.value = value;
  }
  async getPlanContext(): Promise<PlanContext | null> {
    return this.value;
  }
}

export class FakeDailySnapshotPort implements DailySnapshotPort {
  constructor(private value: DailySnapshot | null = SAMPLE_SNAPSHOT) {}
  setValue(value: DailySnapshot | null): void {
    this.value = value;
  }
  async getTodaySnapshot(): Promise<DailySnapshot | null> {
    return this.value;
  }
}
