import { computePlan, type Gender } from '../../../shared/domain/PlanCalculationService';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfile, UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface UpdateProfileMeasurementsChanges {
  heightCm?: number;
  gender?: Gender;
}

export class UpdateProfileMeasurements {
  constructor(
    private readonly userProfileRepository: UserProfileRepositoryPort,
    private readonly planRepository: PlanRepositoryPort,
  ) {}

  async execute(userId: string, changes: UpdateProfileMeasurementsChanges): Promise<UserProfile> {
    const existingProfile = await this.userProfileRepository.findByUserId(userId);
    if (!existingProfile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    const updatedProfile = await this.userProfileRepository.update({
      userId,
      heightCm: changes.heightCm,
      gender: changes.gender,
    });

    const recalculatedPlan = computePlan({
      weightKg: updatedProfile.weightKg,
      heightCm: updatedProfile.heightCm,
      age: updatedProfile.age,
      gender: updatedProfile.gender,
      workoutsPerWeek: updatedProfile.workoutsPerWeek,
      goal: updatedProfile.goal,
      weeklyPaceKg: updatedProfile.weeklyPaceKg,
    });

    await this.planRepository.update({
      userId,
      ...recalculatedPlan,
    });

    return updatedProfile;
  }
}
