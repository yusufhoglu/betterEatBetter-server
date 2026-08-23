import type { PrismaClient } from '@prisma/client';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type { FoodEntry } from '../../domain/FoodEntry';
import type { FoodEntryRepositoryPort } from '../../ports/FoodEntryRepositoryPort';

const logger = createModuleLogger('food-recognition');

/**
 * Prisma implementation of FoodEntryRepositoryPort.
 * ONLY used by the photo flow (async). Barcode/text/search do not use this.
 */
export class PrismaFoodEntryRepository implements FoodEntryRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async create(entry: Pick<FoodEntry, 'id' | 'userId' | 'status'>): Promise<void> {
    await this.db.foodEntry.create({
      data: {
        id: entry.id,
        userId: entry.userId,
        status: entry.status,
      },
    });
    logger.debug({ id: entry.id }, 'food_entry created');
  }

  async updateResult(
    id: string,
    update: {
      status: FoodEntry['status'];
      items?: FoodEntry['items'];
      macros?: FoodEntry['macros'];
      needsUserAction?: boolean;
      resultJson?: unknown;
      errorCode?: string;
    },
  ): Promise<void> {
    const resultJson =
      update.resultJson ??
      (update.items
        ? { items: update.items, macros: update.macros, needsUserAction: update.needsUserAction }
        : undefined);

    await this.db.foodEntry.update({
      where: { id },
      data: {
        status: update.status,
        resultJson: resultJson as object | undefined,
        errorCode: update.errorCode ?? null,
      },
    });
    logger.debug({ id, status: update.status }, 'food_entry updated');
  }

  async findById(id: string): Promise<FoodEntry | null> {
    const row = await this.db.foodEntry.findUnique({ where: { id } });
    if (!row) return null;

    const result = row.resultJson as {
      items?: FoodEntry['items'];
      macros?: FoodEntry['macros'];
      needsUserAction?: boolean;
    } | null;

    return {
      id: row.id,
      userId: row.userId,
      source: 'photo',
      status: row.status as FoodEntry['status'],
      items: result?.items ?? [],
      macros: result?.macros ?? {
        totalCalories: 0,
        totalProteinGrams: 0,
        totalCarbsGrams: 0,
        totalFatGrams: 0,
      },
      needsUserAction: result?.needsUserAction ?? false,
      errorCode: row.errorCode ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
