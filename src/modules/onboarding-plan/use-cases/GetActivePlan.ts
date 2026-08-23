import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';

/**
 * Stable public entry point for other modules (nutrition-logging) to read a
 * user's active plan. Never throws for a missing plan — a null return means
 * "user hasn't onboarded yet", not an error (onboarding-plan-rule.md).
 */
export class GetActivePlan {
  constructor(private readonly planRepository: PlanRepositoryPort) {}

  async execute(userId: string): Promise<Plan | null> {
    return this.planRepository.findByUserId(userId);
  }
}
