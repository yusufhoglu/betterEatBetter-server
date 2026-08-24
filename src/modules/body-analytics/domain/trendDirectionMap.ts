import type { Goal } from '../../../shared/domain/PlanCalculationService';
import type { BodyMeasurementMetric } from './bodyAnalyticsTypes';

export function isTrendImprovement(metric: BodyMeasurementMetric | 'bmi', delta: number, goal: Goal): boolean {
  if (delta === 0) {
    return true;
  }

  if (metric === 'muscleMass') {
    return delta > 0;
  }

  if (metric === 'weight' || metric === 'bmi') {
    if (goal === 'gain') {
      return delta > 0;
    }

    if (goal === 'maintain') {
      return Math.abs(delta) <= 0.25;
    }

    return delta < 0;
  }

  return delta < 0;
}
