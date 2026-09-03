import { computePlan, type Gender } from '../../../shared/domain/PlanCalculationService';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfile, UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface UpdateProfileMeasurementsChanges {
  heightCm?: number;
  age?: number;
  gender?: Gender;
  // Tape-measure circumferences (cm). waist/neck/hip drive the Navy body-fat
  // estimate; shoulder is stored only for the shoulder-to-waist ratio. Any of
  // these changing recalculates the plan.
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
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
      age: changes.age,
      gender: changes.gender,
      waistCm: changes.waistCm,
      neckCm: changes.neckCm,
      hipCm: changes.hipCm,
      shoulderCm: changes.shoulderCm,
    });

    const recalculatedPlan = computePlan({
      weightKg: updatedProfile.weightKg,
      heightCm: updatedProfile.heightCm,
      age: updatedProfile.age,
      gender: updatedProfile.gender,
      workoutsPerWeek: updatedProfile.workoutsPerWeek,
      goal: updatedProfile.goal,
      weeklyPaceKg: updatedProfile.weeklyPaceKg,
      waistCm: updatedProfile.waistCm,
      neckCm: updatedProfile.neckCm,
      hipCm: updatedProfile.hipCm,
    });

    await this.planRepository.update({
      userId,
      dailyCalories: recalculatedPlan.dailyCalories,
      proteinG: recalculatedPlan.proteinG,
      carbsG: recalculatedPlan.carbsG,
      fatG: recalculatedPlan.fatG,
    });

    return updatedProfile;
  }
}
