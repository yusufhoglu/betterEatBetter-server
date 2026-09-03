import type { GetActivePlan } from '../../../onboarding-plan/use-cases/GetActivePlan';
import type { GetUserProfile } from '../../../onboarding-plan/use-cases/GetUserProfile';
import type { Goal, PlanContext } from '../../domain/dieticianContext';
import type { PlanContextPort } from '../../ports/PlanContextPort';

/**
 * Bridges to onboarding-plan's public read use-cases only. Returns null unless
 * BOTH a profile and an active plan exist — the dietician needs targets to
 * coach against.
 */
export class OnboardingPlanContextAdapter implements PlanContextPort {
  constructor(
    private readonly getUserProfile: GetUserProfile,
    private readonly getActivePlan: GetActivePlan,
  ) {}

  async getPlanContext(userId: string): Promise<PlanContext | null> {
    const [profile, plan] = await Promise.all([
      this.getUserProfile.execute(userId),
      this.getActivePlan.execute(userId),
    ]);

    if (!profile || !plan) {
      return null;
    }

    return {
      goal: profile.goal as Goal,
      dailyCalories: plan.dailyCalories,
      proteinG: plan.proteinG,
      carbsG: plan.carbsG,
      fatG: plan.fatG,
      currentWeightKg: profile.weightKg,
      targetWeightKg: profile.targetWeightKg,
      workoutsPerWeek: profile.workoutsPerWeek,
      age: profile.age,
      gender: profile.gender,
    };
  }
}
