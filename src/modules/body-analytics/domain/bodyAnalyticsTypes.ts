import type { Goal, Gender } from '../../../shared/domain/PlanCalculationService';

export const bodyMeasurementMetrics = ['weight', 'bodyFat', 'waist', 'neck', 'hip', 'muscleMass'] as const;
export type BodyMeasurementMetric = (typeof bodyMeasurementMetrics)[number];

export const trendMetrics = ['weight', 'bodyFat', 'waist', 'muscleMass'] as const;
export type TrendMetric = (typeof trendMetrics)[number];

export const mealRanges = ['week', 'month', 'threeMonths', 'sixMonths', 'year', 'allTime'] as const;
export type MealRange = (typeof mealRanges)[number];

export const measurementRanges = ['1W', '1M', '3M', '6M', '1Y', 'All'] as const;
export type MeasurementRange = (typeof measurementRanges)[number];

export const mealAnalyticsMetrics = ['calories', 'proteinG', 'carbsG', 'fatG'] as const;
export type MealAnalyticsMetric = (typeof mealAnalyticsMetrics)[number];

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface BodyMeasurement {
  id: string;
  userId: string;
  metric: BodyMeasurementMetric;
  value: number;
  unit: string;
  date: Date;
  source: 'manual' | 'synced' | 'edited';
  createdAt: Date;
}

export interface BodySilhouetteProfileRecord {
  userId: string;
  neckCm: number | null;
  shoulderCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  updatedAt: Date;
}

export interface BodyProfileView {
  heightCm: number;
  neckCm: number | null;
  shoulderCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  sex: Gender;
}

export interface AnalyticsUserProfile {
  userId: string;
  weightKg: number;
  targetWeightKg: number | null;
  initialWeightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
  createdAt: Date;
}

export interface MealLogEntry {
  name: string;
  source: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealLogReadModel {
  id: string;
  userId: string;
  date: Date;
  mealType: MealSlot;
  entries: MealLogEntry[];
  loggedAt: Date;
}

export interface MealInsightCard {
  title: string;
  body: string;
}
