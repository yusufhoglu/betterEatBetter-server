import { resolveDateRange } from '../domain/resolveDateRange';
import { isTrendImprovement } from '../domain/trendDirectionMap';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';
import { unitForMetric } from './bodyAnalyticsShared';

const dateLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export class GetMeasurementTrend {
  constructor(
    private readonly repository: BodyMeasurementRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string, metric: 'weight' | 'bodyFat' | 'waist' | 'muscleMass', range: '1W' | '1M' | '3M' | '6M' | '1Y' | 'All') {
    const { startDate, endDate } = resolveDateRange(range);
    const [points, profile] = await Promise.all([
      this.repository.findForMetricInRange(userId, metric, startDate, endDate),
      this.profilePort.getUserProfile(userId),
    ]);

    const current = points.at(-1)?.value ?? null;
    const first = points[0]?.value ?? current ?? 0;
    const last = points.at(-1)?.value ?? current ?? 0;
    const delta = last - first;

    return {
      current,
      unit: unitForMetric(metric),
      decimals: 1,
      points: points.map((point) => ({ date: point.date.toISOString(), value: point.value })),
      dateLabels: points.map((point) => dateLabelFormatter.format(point.date)),
      deltaIsGood: isTrendImprovement(metric, delta, profile?.goal ?? 'maintain'),
    };
  }
}
