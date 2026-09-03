import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BodyProfileView } from '../domain/bodyAnalyticsTypes';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';

/**
 * The current body silhouette is a view over the measurement history: each
 * region resolves to its latest body_measurements row, falling back to the
 * value seeded on the onboarding profile when nothing has been logged yet.
 * height/sex are owned by onboarding-plan and read straight from there.
 */
export class GetBodySilhouetteProfile {
  constructor(
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string): Promise<BodyProfileView> {
    const [onboardingProfile, latestNeck, latestShoulder, latestWaist, latestHip] = await Promise.all([
      this.profilePort.getUserProfile(userId),
      this.measurementRepository.findLatestByMetric(userId, 'neck'),
      this.measurementRepository.findLatestByMetric(userId, 'shoulder'),
      this.measurementRepository.findLatestByMetric(userId, 'waist'),
      this.measurementRepository.findLatestByMetric(userId, 'hip'),
    ]);

    if (!onboardingProfile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    return {
      heightCm: onboardingProfile.heightCm,
      neckCm: latestNeck?.value ?? onboardingProfile.neckCm ?? null,
      shoulderCm: latestShoulder?.value ?? onboardingProfile.shoulderCm ?? null,
      waistCm: latestWaist?.value ?? onboardingProfile.waistCm ?? null,
      hipCm: latestHip?.value ?? onboardingProfile.hipCm ?? null,
      sex: onboardingProfile.gender,
    };
  }
}
