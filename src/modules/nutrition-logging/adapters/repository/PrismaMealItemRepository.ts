import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ConflictError } from '../../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { TransactionClient } from '../../../../shared/persistence/transaction';
import type { MealItem, MealType } from '../../domain/MealItem';
import type {
  AppendMealEntriesInput,
  MealItemRepositoryPort,
  ReplaceMealEntriesInput,
} from '../../ports/MealItemRepositoryPort';

type DbClient = PrismaClient | TransactionClient;

function normalizeDate(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function mapMealItem(row: {
  id: string;
  userId: string;
  date: Date;
  mealType: string;
  entries: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): MealItem {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    mealType: row.mealType as MealType,
    entries: row.entries as unknown as MealItem['entries'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMealEntries(value: Prisma.JsonValue): MealItem['entries'] {
  return value as unknown as MealItem['entries'];
}

function toJsonValue(entries: MealItem['entries']): Prisma.InputJsonValue {
  return entries as unknown as Prisma.InputJsonValue;
}

function isKnownPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export class PrismaMealItemRepository implements MealItemRepositoryPort {
  constructor(private readonly db: DbClient) {}

  async appendEntries(input: AppendMealEntriesInput, tx?: TransactionClient): Promise<MealItem> {
    const client = tx ?? this.db;
    const date = normalizeDate(input.date);
    const where = {
      userId_date_mealType: {
        userId: input.userId,
        date,
        mealType: input.mealType,
      },
    };

    const existing = await client.mealItem.findUnique({ where });
    if (existing) {
      const updated = await client.mealItem.update({
        where: { id: existing.id },
        data: {
          entries: toJsonValue([...toMealEntries(existing.entries), ...input.entries]),
        },
      });
      return mapMealItem(updated);
    }

    try {
      const created = await client.mealItem.create({
        data: {
          userId: input.userId,
          date,
          mealType: input.mealType,
          entries: toJsonValue(input.entries),
        },
      });
      return mapMealItem(created);
    } catch (err) {
      if (!isKnownPrismaError(err) || err.code !== 'P2002') {
        throw err;
      }

      const concurrent = await client.mealItem.findUnique({ where });
      if (!concurrent) {
        throw new ConflictError('MEAL_ITEM_CONFLICT', 'Meal item could not be saved due to a concurrent conflict');
      }

      const updated = await client.mealItem.update({
        where: { id: concurrent.id },
        data: {
          entries: toJsonValue([...toMealEntries(concurrent.entries), ...input.entries]),
        },
      });
      return mapMealItem(updated);
    }
  }

  async replaceEntries(input: ReplaceMealEntriesInput, tx?: TransactionClient): Promise<MealItem> {
    const client = tx ?? this.db;

    try {
      const updated = await client.mealItem.update({
        where: { id: input.mealItemId },
        data: {
          entries: toJsonValue(input.entries),
        },
      });
      return mapMealItem(updated);
    } catch (err) {
      if (isKnownPrismaError(err) && err.code === 'P2025') {
        throw new NotFoundError('MEAL_ITEM_NOT_FOUND', 'Meal item was not found');
      }
      throw err;
    }
  }

  async findByUserIdAndDate(userId: string, date: Date): Promise<MealItem[]> {
    const rows = await this.db.mealItem.findMany({
      where: {
        userId,
        date: normalizeDate(date),
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(mapMealItem);
  }

  async findRecentByUserId(userId: string, limit: number): Promise<MealItem[]> {
    const rows = await this.db.mealItem.findMany({
      where: { userId },
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return rows.map(mapMealItem);
  }

  async findByUserIdDateAndMealType(userId: string, date: Date, mealType: MealType): Promise<MealItem | null> {
    const row = await this.db.mealItem.findUnique({
      where: {
        userId_date_mealType: {
          userId,
          date: normalizeDate(date),
          mealType,
        },
      },
    });

    return row ? mapMealItem(row) : null;
  }

  async findMealTypesInRange(userId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; mealType: string }>> {
    const rows = await this.db.mealItem.findMany({
      where: {
        userId,
        date: {
          gte: normalizeDate(startDate),
          lte: normalizeDate(endDate),
        },
      },
      select: {
        date: true,
        mealType: true,
      },
      orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
    });

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      mealType: row.mealType,
    }));
  }

  async deleteById(mealItemId: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? this.db;

    try {
      await client.mealItem.delete({ where: { id: mealItemId } });
    } catch (err) {
      if (isKnownPrismaError(err) && err.code === 'P2025') {
        throw new NotFoundError('MEAL_ITEM_NOT_FOUND', 'Meal item was not found');
      }
      throw err;
    }
  }
}
