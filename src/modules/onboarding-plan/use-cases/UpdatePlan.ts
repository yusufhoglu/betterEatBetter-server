import { computePlan, type Goal } from '../../../shared/domain/PlanCalculationService';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { BuildPlanResponse, type EnrichedPlan } from '../domain/BuildPlanResponse';
import { ValidateMacroOverride } from '../domain/ValidateMacroOverride';
import type { PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface UpdatePlanChanges {
  weightKg?: number;
  targetWeightKg?: number | null;
  workoutsPerWeek?: number;
  goal?: Goal;
  weeklyPaceKg?: number;
  dailyCalories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export class UpdatePlan {
  constructor(
    private readonly userProfileRepository: UserProfileRepositoryPort,
    private readonly planRepository: PlanRepositoryPort,
  ) {}

  async execute(userId: string, changes: UpdatePlanChanges): Promise<EnrichedPlan> {
    const existingProfile = await this.userProfileRepository.findByUserId(userId);
    if (!existingProfile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    ValidateMacroOverride({
      dailyCalories: changes.dailyCalories,
      proteinG: changes.proteinG,
      carbsG: changes.carbsG,
      fatG: changes.fatG,
    });

    const updatedProfile = await this.userProfileRepository.update({
      userId,
      weightKg: changes.weightKg,
      targetWeightKg: changes.targetWeightKg,
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

    const plan = await this.planRepository.update({
      userId,
      dailyCalories: changes.dailyCalories ?? recalculatedPlan.dailyCalories,
      proteinG: changes.proteinG ?? recalculatedPlan.proteinG,
      carbsG: changes.carbsG ?? recalculatedPlan.carbsG,
      fatG: changes.fatG ?? recalculatedPlan.fatG,
    });

    return BuildPlanResponse(updatedProfile, plan);
  }
}
