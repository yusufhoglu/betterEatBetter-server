import { ComputeActivityTargets } from '../domain/ComputeActivityTargets';
import type { PlanRepositoryPort, PlanSource } from '../ports/PlanRepositoryPort';
import type { UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface DailyTargets {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  steps: number;
  waterAuto: boolean;
  stepsAuto: boolean;
  source: PlanSource;
}

/**
 * Public entry point: every daily target a user is measured against, with
 * water/steps resolved (override or automatic). Null until onboarding is done.
 */
export class GetDailyTargets {
  constructor(
    private readonly planRepository: PlanRepositoryPort,
    private readonly userProfileRepository: UserProfileRepositoryPort,
  ) {}

  async execute(userId: string): Promise<DailyTargets | null> {
    const [plan, profile] = await Promise.all([
      this.planRepository.findByUserId(userId),
      this.userProfileRepository.findByUserId(userId),
    ]);
    if (!plan || !profile) {
      return null;
    }
    return {
      dailyCalories: plan.dailyCalories,
      proteinG: plan.proteinG,
      carbsG: plan.carbsG,
      fatG: plan.fatG,
      ...ComputeActivityTargets(profile, plan),
      source: plan.source ?? 'self',
    };
  }
}
