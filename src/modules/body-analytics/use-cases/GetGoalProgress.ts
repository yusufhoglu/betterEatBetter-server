import { computeGoalProgressFraction } from '../domain/computeGoalProgressFraction';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { DailyTrackingPort } from '../ports/DailyTrackingPort';
import type { ProfilePort } from '../ports/ProfilePort';

export class GetGoalProgress {
  constructor(
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
    private readonly profilePort: ProfilePort,
    private readonly dailyTrackingPort: DailyTrackingPort,
  ) {}

  async execute(userId: string) {
    const [profile, latestWeight, status] = await Promise.all([
      this.profilePort.getUserProfile(userId),
      this.measurementRepository.findLatestByMetric(userId, 'weight'),
      this.dailyTrackingPort.getTodayStatus(userId),
    ]);

    if (!profile) {
      return {
        currentWeightKg: null,
        goalWeightKg: null,
        startWeightKg: null,
        streakDays: status.currentStreak,
        progressFraction: null,
        remainingKg: null,
      };
    }

    const currentWeightKg = latestWeight?.value ?? profile.weightKg;
    const progressFraction = computeGoalProgressFraction(
      profile.initialWeightKg,
      currentWeightKg,
      profile.targetWeightKg,
    );

    return {
      currentWeightKg,
      goalWeightKg: profile.targetWeightKg,
      startWeightKg: profile.initialWeightKg,
      streakDays: status.currentStreak,
      progressFraction,
      remainingKg: profile.targetWeightKg === null ? null : Number(Math.abs(profile.targetWeightKg - currentWeightKg).toFixed(1)),
    };
  }
}
