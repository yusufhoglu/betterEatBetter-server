import { ValidationError } from '../../../shared/errors/ValidationError';
import type {
  BodyMeasurementMetric,
  MealAnalyticsMetric,
  MealLogEntry,
  MealLogReadModel,
  MealSlot,
} from '../domain/bodyAnalyticsTypes';

export function assertBodyMeasurementMetric(value: string): asserts value is BodyMeasurementMetric {
  if (!['weight', 'bodyFat', 'waist', 'neck', 'hip', 'muscleMass'].includes(value)) {
    throw new ValidationError('INVALID_METRIC', 'Unsupported body measurement metric');
  }
}

export function assertMealSlot(value: string): asserts value is MealSlot {
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(value)) {
    throw new ValidationError('INVALID_MEAL_SLOT', 'Unsupported meal slot');
  }
}

export function assertMealMetric(value: string): asserts value is MealAnalyticsMetric {
  if (!['calories', 'proteinG', 'carbsG', 'fatG'].includes(value)) {
    throw new ValidationError('INVALID_METRIC', 'Unsupported meal analytics metric');
  }
}

export function unitForMetric(metric: BodyMeasurementMetric): string {
  switch (metric) {
    case 'weight':
    case 'muscleMass':
      return 'kg';
    case 'bodyFat':
      return '%';
    case 'waist':
    case 'neck':
    case 'hip':
      return 'cm';
  }
}

export function sumEntries(logs: MealLogReadModel[]): { calories: number; proteinG: number; carbsG: number; fatG: number } {
  return logs.reduce(
    (acc, log) => {
      for (const entry of log.entries) {
        acc.calories += entry.calories;
        acc.proteinG += entry.proteinG;
        acc.carbsG += entry.carbsG;
        acc.fatG += entry.fatG;
      }
      return acc;
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

export function sumEntryMetric(entries: MealLogEntry[], metric: MealAnalyticsMetric): number {
  return entries.reduce((total, entry) => total + (metric === 'calories' ? entry.calories : entry[metric]), 0);
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
