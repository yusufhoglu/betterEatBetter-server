export interface PlanTargetPort {
  getPlanTargets(userId: string): Promise<{
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>;
}
