import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BodySilhouetteProfileRepositoryPort } from '../ports/BodySilhouetteProfileRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';

export class GetWaistHeightRatio {
  constructor(
    private readonly profileRepository: BodySilhouetteProfileRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string): Promise<{ ratio: number | null; classification: 'low' | 'moderate' | 'high' | null }> {
    const [profile, silhouette] = await Promise.all([
      this.profilePort.getUserProfile(userId),
      this.profileRepository.findByUserId(userId),
    ]);

    if (!profile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    if (!silhouette?.waistCm) {
      return { ratio: null, classification: null };
    }

    const ratio = Number((silhouette.waistCm / profile.heightCm).toFixed(2));
    const classification = ratio < 0.5 ? 'low' : ratio < 0.6 ? 'moderate' : 'high';
    return { ratio, classification };
  }
}
