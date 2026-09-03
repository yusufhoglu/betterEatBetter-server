import type { PlanContext } from '../domain/dieticianContext';

export interface PlanContextPort {
  /** null when the user has not completed onboarding / has no active plan. */
  getPlanContext(userId: string): Promise<PlanContext | null>;
}
