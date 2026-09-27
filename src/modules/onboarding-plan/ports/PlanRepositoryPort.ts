/** 'dietitian' → targets are owned by the client's assigned dietitian (practice module). */
export type PlanSource = 'self' | 'dietitian';

export interface Plan {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source?: PlanSource;
  setByDietitianId?: string | null;
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

export interface UpdatePlanInput {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Omitted → ownership unchanged. */
  source?: PlanSource;
  setByDietitianId?: string | null;
}

/**
 * Owned by onboarding-plan; nutrition-logging reads plans only through
 * GetActivePlan, never through this port or a direct Prisma query
 * (onboarding-plan-rule.md).
 */
export interface PlanRepositoryPort {
  findByUserId(userId: string): Promise<Plan | null>;
  create(input: CreatePlanInput): Promise<Plan>;
  update(input: UpdatePlanInput): Promise<Plan>;
}
