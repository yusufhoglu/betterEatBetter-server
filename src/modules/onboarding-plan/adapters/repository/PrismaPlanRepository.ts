import type { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { CreatePlanInput, Plan, PlanSource, PlanRepositoryPort, UpdatePlanInput } from '../../ports/PlanRepositoryPort';

const logger = createModuleLogger('prisma-plan-repository');

function toPlan(row: Omit<Plan, 'source'> & { source: string }): Plan {
  return { ...row, source: row.source as PlanSource };
}

export class PrismaPlanRepository implements PlanRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string): Promise<Plan | null> {
    logger.info({ userId }, 'querying plan by userId');
    const plan = await this.db.plan.findUnique({ where: { userId } });
    return plan ? toPlan(plan) : null;
  }

  async create(input: CreatePlanInput): Promise<Plan> {
    logger.info({ userId: input.userId }, 'creating plan');
    return toPlan(await this.db.plan.create({ data: input }));
  }

  async update(input: UpdatePlanInput): Promise<Plan> {
    logger.info({ userId: input.userId }, 'updating plan');
    const plan = await this.db.plan.update({
      where: { userId: input.userId },
      data: {
        dailyCalories: input.dailyCalories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        source: input.source,
        setByDietitianId: input.setByDietitianId,
      },
    });
    return toPlan(plan);
  }
}
