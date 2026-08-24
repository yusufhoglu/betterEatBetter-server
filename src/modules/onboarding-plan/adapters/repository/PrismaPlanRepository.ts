import type { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { CreatePlanInput, Plan, PlanRepositoryPort, UpdatePlanInput } from '../../ports/PlanRepositoryPort';

const logger = createModuleLogger('prisma-plan-repository');

export class PrismaPlanRepository implements PlanRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string): Promise<Plan | null> {
    logger.info({ userId }, 'querying plan by userId');
    return this.db.plan.findUnique({ where: { userId } });
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    logger.info({ userId: input.userId }, 'creating plan');
    return this.db.plan.create({ data: input });
  }

  async update(input: UpdatePlanInput): Promise<Plan> {
    logger.info({ userId: input.userId }, 'updating plan');
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
