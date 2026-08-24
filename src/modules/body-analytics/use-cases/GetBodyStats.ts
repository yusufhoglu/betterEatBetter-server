import { computeGoalProgressFraction } from '../domain/computeGoalProgressFraction';
import { isTrendImprovement } from '../domain/trendDirectionMap';
import type { BodyMeasurementMetric } from '../domain/bodyAnalyticsTypes';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { BodySilhouetteProfileRepositoryPort } from '../ports/BodySilhouetteProfileRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';

function computeBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function computeTrend(
  repository: BodyMeasurementRepositoryPort,
  userId: string,
  metric: BodyMeasurementMetric,
): Promise<number> {
  const today = new Date();
  const endDate = new Date(`${today.toISOString().slice(0, 10)}T23:59:59.999Z`);
  const recentStart = new Date(endDate);
  recentStart.setUTCDate(recentStart.getUTCDate() - 6);
  recentStart.setUTCHours(0, 0, 0, 0);
  const previousEnd = new Date(recentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  previousEnd.setUTCHours(23, 59, 59, 999);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - 6);
  previousStart.setUTCHours(0, 0, 0, 0);

  const [recent, previous] = await Promise.all([
    repository.findForMetricInRange(userId, metric, recentStart, endDate),
    repository.findForMetricInRange(userId, metric, previousStart, previousEnd),
  ]);

  if (recent.length === 0 || previous.length === 0) {
    return 0;
  }

  return Number((average(recent.map((item) => item.value)) - average(previous.map((item) => item.value))).toFixed(1));
}

export class GetBodyStats {
  constructor(
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
    private readonly silhouetteProfileRepository: BodySilhouetteProfileRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string) {
    const profile = await this.profilePort.getUserProfile(userId);
    if (!profile) {
      return {
        weight: { value: null, unit: 'kg', fraction: null, trendValue: 0, trendIsGood: true },
        bodyFat: { value: null, unit: '%', fraction: null, trendValue: 0, trendIsGood: true },
        waist: { value: null, unit: 'cm', fraction: null, trendValue: 0, trendIsGood: true },
        bmi: { value: null, unit: '', fraction: null, trendValue: 0, trendIsGood: true },
      };
    }

    const [latestWeight, latestBodyFat, latestWaist, silhouetteProfile] = await Promise.all([
      this.measurementRepository.findLatestByMetric(userId, 'weight'),
      this.measurementRepository.findLatestByMetric(userId, 'bodyFat'),
      this.measurementRepository.findLatestByMetric(userId, 'waist'),
      this.silhouetteProfileRepository.findByUserId(userId),
    ]);

    const weightValue = latestWeight?.value ?? profile.weightKg;
    const bmiValue = computeBmi(weightValue, profile.heightCm);
    const initialBmi = computeBmi(profile.initialWeightKg, profile.heightCm);
    const targetBmi = profile.targetWeightKg === null ? null : computeBmi(profile.targetWeightKg, profile.heightCm);
    const [weightTrend, bodyFatTrend, waistTrend] = await Promise.all([
      computeTrend(this.measurementRepository, userId, 'weight'),
      computeTrend(this.measurementRepository, userId, 'bodyFat'),
      computeTrend(this.measurementRepository, userId, 'waist'),
    ]);

    return {
      weight: {
        value: weightValue,
        unit: 'kg',
        fraction: computeGoalProgressFraction(profile.initialWeightKg, weightValue, profile.targetWeightKg),
        trendValue: weightTrend,
        trendIsGood: isTrendImprovement('weight', weightTrend, profile.goal),
      },
      bodyFat: {
        value: latestBodyFat?.value ?? null,
        unit: '%',
        fraction: null,
        trendValue: bodyFatTrend,
        trendIsGood: isTrendImprovement('bodyFat', bodyFatTrend, profile.goal),
      },
      waist: {
        value: latestWaist?.value ?? silhouetteProfile?.waistCm ?? null,
        unit: 'cm',
        fraction: null,
        trendValue: waistTrend,
        trendIsGood: isTrendImprovement('waist', waistTrend, profile.goal),
      },
      bmi: {
        value: bmiValue,
        unit: '',
        fraction: computeGoalProgressFraction(initialBmi, bmiValue, targetBmi),
        trendValue: Number((computeBmi(weightValue + weightTrend, profile.heightCm) - bmiValue).toFixed(1)),
        trendIsGood: isTrendImprovement('bmi', weightTrend, profile.goal),
      },
    };
  }
}
