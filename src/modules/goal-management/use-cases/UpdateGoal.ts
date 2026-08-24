import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { GoalPlan, PlanUpdaterPort } from '../ports/PlanUpdaterPort';

const updateGoalSchema = z
  .object({
    weightKg: z.number().positive().optional(),
    targetWeightKg: z.number().positive().optional(),
    workoutsPerWeek: z.number().int().min(0).optional(),
    goal: z.enum(['lose', 'maintain', 'gain']).optional(),
    weeklyPaceKg: z.number().positive().optional(),
    dailyCalories: z.number().int().positive().optional(),
    proteinG: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one goal field must be provided',
  });

export class UpdateGoal {
  constructor(private readonly planUpdater: PlanUpdaterPort) {}

  async execute(userId: string, changes: unknown): Promise<GoalPlan> {
    const parsed = updateGoalSchema.safeParse(changes);
    if (!parsed.success) {
      throw new ValidationError('INVALID_GOAL_UPDATE', parsed.error.issues[0]?.message ?? 'Invalid goal update');
    }

    return this.planUpdater.update(userId, parsed.data);
  }
}
