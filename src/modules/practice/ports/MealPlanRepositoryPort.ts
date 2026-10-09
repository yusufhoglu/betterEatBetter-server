import type { CustomFood, CustomFoodInput, MealPlan, MealPlanInput, PlanHeader } from '../domain/mealPlan';

export interface MealPlanRepositoryPort {
  findPlanByLink(linkId: string): Promise<MealPlan | null>;
  /** Creates or replaces the plan of this link. */
  savePlan(linkId: string, dietitianId: string, input: MealPlanInput): Promise<MealPlan>;
  deletePlan(linkId: string): Promise<void>;

  findHeader(dietitianId: string): Promise<PlanHeader | null>;
  saveHeader(dietitianId: string, header: PlanHeader): Promise<PlanHeader>;

  searchCustomFoods(dietitianId: string, query: string, limit: number): Promise<CustomFood[]>;
  findCustomFood(id: string): Promise<CustomFood | null>;
  createCustomFood(dietitianId: string, input: CustomFoodInput): Promise<CustomFood>;
  updateCustomFood(id: string, input: CustomFoodInput): Promise<CustomFood>;
  deleteCustomFood(id: string): Promise<void>;
}
