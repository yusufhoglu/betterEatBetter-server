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

    const existingPlan = await this.planRepository.findByUserId(userId);

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
      waistCm: updatedProfile.waistCm,
      neckCm: updatedProfile.neckCm,
      hipCm: updatedProfile.hipCm,
    });

    // A goal-parameter change (weight, pace, workouts, goal, target) is an
    // explicit "recompute my whole plan" signal. A request carrying only macro
    // fields is a manual tweak — keep the other *stored* macro values instead
    // of snapping them back to the freshly computed ones, so independent edits
    // to each macro (e.g. one ring at a time on the plan-ready screen)
    // accumulate rather than overwriting each other.
    const goalParamsChanged =
      changes.weightKg !== undefined ||
      changes.targetWeightKg !== undefined ||
      changes.workoutsPerWeek !== undefined ||
      changes.goal !== undefined ||
      changes.weeklyPaceKg !== undefined;

    const base = goalParamsChanged || !existingPlan ? recalculatedPlan : existingPlan;

    const plan = await this.planRepository.update({
      userId,
      dailyCalories: changes.dailyCalories ?? base.dailyCalories,
      proteinG: changes.proteinG ?? base.proteinG,
      carbsG: changes.carbsG ?? base.carbsG,
      fatG: changes.fatG ?? base.fatG,
    });

    return BuildPlanResponse(updatedProfile, plan);
  }
}
