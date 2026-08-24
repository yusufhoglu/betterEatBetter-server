import type { Prisma, PrismaClient } from '@prisma/client';
import type { MealLogReadModel } from '../../domain/bodyAnalyticsTypes';
import type { DeleteMealLogInput, MealLogReadModelPort, UpsertMealLogInput } from '../../ports/MealLogReadModelPort';

function toDomain(row: {
  id: string;
  userId: string;
  date: Date;
  mealType: string;
  entries: unknown;
  loggedAt: Date;
}): MealLogReadModel {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    mealType: row.mealType as MealLogReadModel['mealType'],
    entries: row.entries as MealLogReadModel['entries'],
    loggedAt: row.loggedAt,
  };
}

export class PrismaMealLogReadModelRepository implements MealLogReadModelPort {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: UpsertMealLogInput): Promise<MealLogReadModel> {
    const row = await this.db.mealLogReadModel.upsert({
      where: {
        userId_date_mealType: {
          userId: input.userId,
          date: input.date,
          mealType: input.mealType,
        },
      },
      create: {
        userId: input.userId,
        date: input.date,
        mealType: input.mealType,
        entries: input.entries as unknown as Prisma.InputJsonValue,
      },
      update: {
        entries: input.entries as unknown as Prisma.InputJsonValue,
      },
    });
    return toDomain(row);
  }

  async delete(input: DeleteMealLogInput): Promise<void> {
    await this.db.mealLogReadModel.deleteMany({
      where: {
        userId: input.userId,
        date: input.date,
        mealType: input.mealType,
      },
    });
  }

  async listForRange(userId: string, startDate: Date | null, endDate: Date): Promise<MealLogReadModel[]> {
    return (
      await this.db.mealLogReadModel.findMany({
        where: {
          userId,
          date: {
            gte: startDate ?? undefined,
            lte: endDate,
          },
        },
        orderBy: { date: 'asc' },
      })
    ).map(toDomain);
  }
}
