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

    // A region the user edited on the Analytics tab wins; otherwise fall back to
    // whatever they entered during onboarding so those measurements aren't lost.
    return {
      heightCm: onboardingProfile.heightCm,
      neckCm: silhouetteProfile?.neckCm ?? onboardingProfile.neckCm ?? null,
      shoulderCm: silhouetteProfile?.shoulderCm ?? onboardingProfile.shoulderCm ?? null,
      waistCm: silhouetteProfile?.waistCm ?? onboardingProfile.waistCm ?? null,
      hipCm: silhouetteProfile?.hipCm ?? onboardingProfile.hipCm ?? null,
      sex: onboardingProfile.gender,
    };
  }
}
