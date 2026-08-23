import type { PrismaClient } from '@prisma/client';
import type { CreatePlanInput, Plan, PlanRepositoryPort, UpdatePlanInput } from '../../ports/PlanRepositoryPort';

export class PrismaPlanRepository implements PlanRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string): Promise<Plan | null> {
    return this.db.plan.findUnique({ where: { userId } });
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    return this.db.plan.create({ data: input });
  }

  async update(input: UpdatePlanInput): Promise<Plan> {
    return this.db.plan.update({
      where: { userId: input.userId },
      data: {
        dailyCalories: input.dailyCalories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
      },
    });
  }
}
