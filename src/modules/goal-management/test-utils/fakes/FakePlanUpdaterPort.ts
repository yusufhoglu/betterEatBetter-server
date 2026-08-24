import type { GoalPlan, PlanUpdaterPort, UpdateGoalChanges } from '../../ports/PlanUpdaterPort';

export class FakePlanUpdaterPort implements PlanUpdaterPort {
  calls: Array<{ userId: string; changes: UpdateGoalChanges }> = [];
  result: GoalPlan = {
    userId: 'user-1',
    dailyCalories: 1898,
    proteinG: 160,
    carbsG: 157,
    fatG: 70,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
    projection: {
      startWeightKg: 80,
      targetWeightKg: 72,
      estimatedTargetDate: new Date('2026-11-15T00:00:00.000Z'),
    },
    healthScore: 82,
  };

  async update(userId: string, changes: UpdateGoalChanges): Promise<GoalPlan> {
    this.calls.push({ userId, changes });
    return this.result;
  }
}
