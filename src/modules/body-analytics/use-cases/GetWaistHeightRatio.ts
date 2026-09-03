import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';

export class GetWaistHeightRatio {
  constructor(
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string): Promise<{ ratio: number | null; classification: 'low' | 'moderate' | 'high' | null }> {
    const [profile, latestWaist] = await Promise.all([
      this.profilePort.getUserProfile(userId),
      this.measurementRepository.findLatestByMetric(userId, 'waist'),
    ]);

    if (!profile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    const waistCm = latestWaist?.value ?? profile.waistCm ?? null;
    if (!waistCm) {
      return { ratio: null, classification: null };
    }

    const ratio = Number((waistCm / profile.heightCm).toFixed(2));
    const classification = ratio < 0.5 ? 'low' : ratio < 0.6 ? 'moderate' : 'high';
    return { ratio, classification };
  }
}
