import type { PlanTargetPort } from '../../ports/PlanTargetPort';

export class FakePlanTargetPort implements PlanTargetPort {
  constructor(
    private readonly plan: {
      dailyCalories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    } | null,
  ) {}

  async getPlanTargets(): Promise<{
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null> {
    return this.plan;
  }
}
