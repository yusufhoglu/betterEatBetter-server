import type { CreatePlanInput, Plan, PlanRepositoryPort } from '../../ports/PlanRepositoryPort';

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
}
