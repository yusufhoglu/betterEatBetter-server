import { computePlan, type Goal } from '../../../shared/domain/PlanCalculationService';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface UpdatePlanChanges {
  weightKg?: number;
  workoutsPerWeek?: number;
  goal?: Goal;
  weeklyPaceKg?: number;
}

export class UpdatePlan {
  constructor(
    private readonly userProfileRepository: UserProfileRepositoryPort,
    private readonly planRepository: PlanRepositoryPort,
  ) {}

  async execute(userId: string, changes: UpdatePlanChanges): Promise<Plan> {
    const existingProfile = await this.userProfileRepository.findByUserId(userId);
    if (!existingProfile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    const updatedProfile = await this.userProfileRepository.update({
      userId,
      weightKg: changes.weightKg,
      workoutsPerWeek: changes.workoutsPerWeek,
      goal: changes.goal,
      weeklyPaceKg: changes.weeklyPaceKg,
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

    return this.planRepository.update({
      userId,
      ...recalculatedPlan,
    });
  }
}
