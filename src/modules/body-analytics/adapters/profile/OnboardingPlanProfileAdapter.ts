import type { GetUserProfile } from '../../../onboarding-plan/use-cases/GetUserProfile';
import type { UpdateProfileMeasurements } from '../../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import type { ProfilePort, UpdateProfileMeasurementsInput } from '../../ports/ProfilePort';

export class OnboardingPlanProfileAdapter implements ProfilePort {
  constructor(
    private readonly getUserProfileUseCase: GetUserProfile,
    private readonly updateProfileMeasurementsUseCase: UpdateProfileMeasurements,
  ) {}

  async getUserProfile(userId: string) {
    return this.getUserProfileUseCase.execute(userId);
  }

  async updateProfileMeasurements(userId: string, changes: UpdateProfileMeasurementsInput) {
    return this.updateProfileMeasurementsUseCase.execute(userId, changes);
  }
}
