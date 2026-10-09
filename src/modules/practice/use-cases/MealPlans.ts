import { createModuleLogger } from '../../../shared/observability/logger';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import {
  EMPTY_PLAN_HEADER,
  type CustomFood,
  type CustomFoodInput,
  type FoodOption,
  type MealPlan,
  type MealPlanInput,
  type PlanHeader,
} from '../domain/mealPlan';
import type { FoodSearchPort } from '../ports/FoodSearchPort';
import type { MealPlanRepositoryPort } from '../ports/MealPlanRepositoryPort';
import type { PlanNotifierPort } from '../ports/PlanNotifierPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

const logger = createModuleLogger('practice');

const FOOD_SEARCH_LIMIT = 20;
/** Saving is repeated while editing; the client hears about it at most this often. */
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const CUSTOM_FOOD_LIMIT = 500;

/**
 * Meal plans a dietitian writes for a client. The plan is the dietitian's own
 * work product (not client health data), so no consent scope applies: staff who
 * can see the client read it, only the assigned dietitian writes it, and the
 * client reads the plan of their active link.
 */
export class MealPlans {
  constructor(
    private readonly plans: MealPlanRepositoryPort,
    private readonly practice: PracticeRepositoryPort,
    private readonly policy: ClientAccessPolicy,
    private readonly catalog: FoodSearchPort,
    private readonly notifier: PlanNotifierPort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // ─── plans ─────────────────────────────────────────────────────────────
  async getForClient(actorId: string, clientId: string): Promise<MealPlan | null> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    return this.plans.findPlanByLink(link.id);
  }

  async save(actorId: string, clientId: string, input: MealPlanInput): Promise<MealPlan> {
    const link = await this.policy.assertAssigned(actorId, clientId);
    const previous = await this.plans.findPlanByLink(link.id);
    const saved = await this.plans.savePlan(link.id, actorId, input);
    const quiet = previous !== null && this.clock().getTime() - previous.updatedAt.getTime() < NOTIFY_COOLDOWN_MS;
    if (!quiet && input.meals.length > 0) {
      this.notifier.notifyPlanUpdated(clientId).catch((err: unknown) => {
        logger.warn({ err, clientId }, 'failed to push meal plan update');
      });
    }
    return saved;
  }

  async remove(actorId: string, clientId: string): Promise<void> {
    const link = await this.policy.assertAssigned(actorId, clientId);
    await this.plans.deletePlan(link.id);
  }

  /** The client's own plan, from their active dietitian. */
  async getMine(clientId: string): Promise<MealPlan | null> {
    const link = await this.practice.findActiveLinkForClient(clientId);
    return link ? this.plans.findPlanByLink(link.id) : null;
  }

  // ─── header ────────────────────────────────────────────────────────────
  async getHeader(actorId: string): Promise<PlanHeader> {
    await this.requireDietitian(actorId);
    return (await this.plans.findHeader(actorId)) ?? EMPTY_PLAN_HEADER;
  }

  async saveHeader(actorId: string, header: PlanHeader): Promise<PlanHeader> {
    await this.requireDietitian(actorId);
    return this.plans.saveHeader(actorId, header);
  }

  // ─── foods ─────────────────────────────────────────────────────────────
  /** Own foods first, then the shared catalog. */
  async searchFoods(actorId: string, query: string): Promise<FoodOption[]> {
    await this.requireDietitian(actorId);
    const q = query.trim();
    const own = (await this.plans.searchCustomFoods(actorId, q, FOOD_SEARCH_LIMIT)).map(toOption);
    if (q.length < 2) {
      return own;
    }
    return [...own, ...(await this.catalog.search(q, FOOD_SEARCH_LIMIT))];
  }

  async createFood(actorId: string, input: CustomFoodInput): Promise<CustomFood> {
    await this.requireDietitian(actorId);
    const existing = await this.plans.searchCustomFoods(actorId, '', CUSTOM_FOOD_LIMIT + 1);
    if (existing.length > CUSTOM_FOOD_LIMIT) {
      throw new ForbiddenError('CUSTOM_FOOD_LIMIT', 'Custom food limit reached');
    }
    return this.plans.createCustomFood(actorId, input);
  }

  async updateFood(actorId: string, foodId: string, input: CustomFoodInput): Promise<CustomFood> {
    await this.requireOwnFood(actorId, foodId);
    return this.plans.updateCustomFood(foodId, input);
  }

  async removeFood(actorId: string, foodId: string): Promise<void> {
    await this.requireOwnFood(actorId, foodId);
    await this.plans.deleteCustomFood(foodId);
  }

  private async requireDietitian(actorId: string): Promise<void> {
    if (!(await this.practice.findDietitianProfile(actorId))) {
      throw new ForbiddenError('NOT_A_DIETITIAN', 'Dietitian account required');
    }
  }

  private async requireOwnFood(actorId: string, foodId: string): Promise<void> {
    await this.requireDietitian(actorId);
    const food = await this.plans.findCustomFood(foodId);
    if (!food || food.dietitianId !== actorId) {
      throw new NotFoundError('FOOD_NOT_FOUND', 'Food not found');
    }
  }
}

function toOption(food: CustomFood): FoodOption {
  return {
    source: 'custom',
    id: food.id,
    name: food.name,
    brand: null,
    amount: food.amount,
    unit: food.unit,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
  };
}
