import { resolveDateRange } from '../domain/resolveDateRange';
import type { BodyMeasurementMetric, MealAnalyticsMetric } from '../domain/bodyAnalyticsTypes';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import { sumEntryMetric, toDateKey } from './bodyAnalyticsShared';

export class GetMealCorrelation {
  constructor(
    private readonly mealRepository: MealLogReadModelPort,
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
  ) {}

  async execute(
    userId: string,
    x: MealAnalyticsMetric,
    y: BodyMeasurementMetric,
    range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime',
  ) {
    const { startDate, endDate } = resolveDateRange(range);
    const [logs, measurements] = await Promise.all([
      this.mealRepository.listForRange(userId, startDate, endDate),
      this.measurementRepository.findForMetricInRange(userId, y, startDate, endDate),
    ]);

    const xByDate = new Map<string, number>();
    for (const log of logs) {
      const key = toDateKey(log.date);
      xByDate.set(key, (xByDate.get(key) ?? 0) + sumEntryMetric(log.entries, x));
    }

    return measurements
      .map((measurement) => ({
        date: toDateKey(measurement.date),
        x: Math.round(xByDate.get(toDateKey(measurement.date)) ?? 0),
        y: measurement.value,
      }))
      .filter((point) => point.x > 0);
  }
}
