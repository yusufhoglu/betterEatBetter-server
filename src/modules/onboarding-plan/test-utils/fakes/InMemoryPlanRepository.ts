import type { CreatePlanInput, Plan, PlanRepositoryPort, UpdatePlanInput } from '../../ports/PlanRepositoryPort';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';

export class InMemoryPlanRepository implements PlanRepositoryPort {
  private readonly plansByUserId = new Map<string, Plan>();

  async findByUserId(userId: string): Promise<Plan | null> {
    return this.plansByUserId.get(userId) ?? null;
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    const now = new Date();
    const plan: Plan = { ...input, createdAt: now, updatedAt: now };
    this.plansByUserId.set(input.userId, plan);
    return plan;
  }

  async update(input: UpdatePlanInput): Promise<Plan> {
    const existingPlan = this.plansByUserId.get(input.userId);
    if (!existingPlan) {
      throw new NotFoundError('PLAN_NOT_FOUND', `Plan not found for userId=${input.userId}`);
    }

    const updatedPlan: Plan = {
      ...existingPlan,
      ...input,
      updatedAt: new Date(),
    };

    this.plansByUserId.set(input.userId, updatedPlan);
    return updatedPlan;
  }

  count(): number {
    return this.plansByUserId.size;
  }
}
