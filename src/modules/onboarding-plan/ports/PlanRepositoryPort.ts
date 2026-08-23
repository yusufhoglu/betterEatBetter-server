export interface Plan {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanInput {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Owned by onboarding-plan; nutrition-logging reads plans only through
 * GetActivePlan, never through this port or a direct Prisma query
 * (onboarding-plan-rule.md).
 */
export interface PlanRepositoryPort {
  findByUserId(userId: string): Promise<Plan | null>;
  create(input: CreatePlanInput): Promise<Plan>;
}
