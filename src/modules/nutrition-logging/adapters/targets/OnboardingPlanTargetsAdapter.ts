import { prisma } from '../../../../shared/persistence/db';
import { PrismaPlanRepository } from '../../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { GetActivePlan } from '../../../onboarding-plan/use-cases/GetActivePlan';
import type { DailyTargets, DailyTargetsPort } from '../../ports/DailyTargetsPort';

export class OnboardingPlanTargetsAdapter implements DailyTargetsPort {
  constructor(private readonly getActivePlan: GetActivePlan = new GetActivePlan(new PrismaPlanRepository(prisma))) {}

  async getDailyTargets(userId: string): Promise<DailyTargets | null> {
    const plan = await this.getActivePlan.execute(userId);
    if (!plan) {
      return null;
    }

    return {
      calories: plan.dailyCalories,
      proteinG: plan.proteinG,
      carbsG: plan.carbsG,
      fatG: plan.fatG,
    };
  }
}
