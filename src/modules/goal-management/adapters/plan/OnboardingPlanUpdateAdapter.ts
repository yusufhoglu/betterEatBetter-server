import type { GoalPlan, PlanUpdaterPort, UpdateGoalChanges } from '../../ports/PlanUpdaterPort';
import type { UpdatePlan } from '../../../onboarding-plan/use-cases/UpdatePlan';

export class OnboardingPlanUpdateAdapter implements PlanUpdaterPort {
  constructor(private readonly updatePlan: UpdatePlan) {}

  async update(userId: string, changes: UpdateGoalChanges): Promise<GoalPlan> {
    return this.updatePlan.execute(userId, changes);
  }
}
