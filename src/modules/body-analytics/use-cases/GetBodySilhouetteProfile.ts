import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BodyProfileView } from '../domain/bodyAnalyticsTypes';
import type { BodySilhouetteProfileRepositoryPort } from '../ports/BodySilhouetteProfileRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';

export class GetBodySilhouetteProfile {
  constructor(
    private readonly profileRepository: BodySilhouetteProfileRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string): Promise<BodyProfileView> {
    const [onboardingProfile, silhouetteProfile] = await Promise.all([
      this.profilePort.getUserProfile(userId),
      this.profileRepository.findByUserId(userId),
    ]);

    if (!onboardingProfile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    return {
      heightCm: onboardingProfile.heightCm,
      neckCm: silhouetteProfile?.neckCm ?? null,
      shoulderCm: silhouetteProfile?.shoulderCm ?? null,
      waistCm: silhouetteProfile?.waistCm ?? null,
      hipCm: silhouetteProfile?.hipCm ?? null,
      sex: onboardingProfile.gender,
    };
  }
}
