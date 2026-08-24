import type { BodySilhouetteProfileRepositoryPort } from '../ports/BodySilhouetteProfileRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';
import { GetBodySilhouetteProfile } from './GetBodySilhouetteProfile';

export interface UpdateBodySilhouetteProfileInput {
  heightCm?: number;
  neckCm?: number | null;
  shoulderCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  sex?: 'male' | 'female';
}

export class UpdateBodySilhouetteProfile {
  constructor(
    private readonly profileRepository: BodySilhouetteProfileRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string, input: UpdateBodySilhouetteProfileInput) {
    if (input.heightCm !== undefined || input.sex !== undefined) {
      await this.profilePort.updateProfileMeasurements(userId, {
        heightCm: input.heightCm,
        gender: input.sex,
      });
    }

    await this.profileRepository.upsert({
      userId,
      neckCm: input.neckCm,
      shoulderCm: input.shoulderCm,
      waistCm: input.waistCm,
      hipCm: input.hipCm,
    });

    return new GetBodySilhouetteProfile(this.profileRepository, this.profilePort).execute(userId);
  }
}
