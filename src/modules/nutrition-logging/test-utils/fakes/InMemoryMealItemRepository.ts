import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { TransactionClient } from '../../../../shared/persistence/transaction';
import type { MealItemRepositoryPort, AppendMealEntriesInput, ReplaceMealEntriesInput } from '../../ports/MealItemRepositoryPort';
import type { MealItem } from '../../domain/MealItem';

function keyOf(userId: string, date: Date, mealType: MealItem['mealType']): string {
  return `${userId}:${date.toISOString()}:${mealType}`;
}

function cloneMealItem(item: MealItem): MealItem {
  return {
    ...item,
    date: new Date(item.date),
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    entries: item.entries.map((entry) => ({ ...entry })),
  };
}

export class InMemoryMealItemRepository implements MealItemRepositoryPort {
  private readonly itemsById = new Map<string, MealItem>();
  private readonly idsByKey = new Map<string, string>();

  async appendEntries(input: AppendMealEntriesInput, _tx?: TransactionClient): Promise<MealItem> {
    const key = keyOf(input.userId, input.date, input.mealType);
    const existingId = this.idsByKey.get(key);
    const now = new Date();

    if (!existingId) {
      const mealItem: MealItem = {
        id: randomUUID(),
        userId: input.userId,
        date: new Date(input.date),
        mealType: input.mealType,
        entries: input.entries.map((entry) => ({ ...entry })),
        createdAt: now,
        updatedAt: now,
      };
      this.itemsById.set(mealItem.id, mealItem);
      this.idsByKey.set(key, mealItem.id);
      return cloneMealItem(mealItem);
    }

    const existing = this.itemsById.get(existingId)!;
    const updated: MealItem = {
      ...existing,
      updatedAt: now,
      entries: [...existing.entries.map((entry) => ({ ...entry })), ...input.entries.map((entry) => ({ ...entry }))],
    };
    this.itemsById.set(existing.id, updated);
    return cloneMealItem(updated);
  }

  async replaceEntries(input: ReplaceMealEntriesInput, _tx?: TransactionClient): Promise<MealItem> {
    const existing = this.itemsById.get(input.mealItemId);
    if (!existing) {
      throw new NotFoundError('MEAL_ITEM_NOT_FOUND', 'Meal item was not found');
    }

    const updated: MealItem = {
      ...existing,
      updatedAt: new Date(),
      entries: input.entries.map((entry) => ({ ...entry })),
    };
    this.itemsById.set(existing.id, updated);
    return cloneMealItem(updated);
  }

  async findByUserIdAndDate(userId: string, date: Date): Promise<MealItem[]> {
    return Array.from(this.itemsById.values())
      .filter((item) => item.userId === userId && item.date.toISOString() === date.toISOString())
      .map(cloneMealItem);
  }

  async findByUserIdDateAndMealType(userId: string, date: Date, mealType: MealItem['mealType']): Promise<MealItem | null> {
    const id = this.idsByKey.get(keyOf(userId, date, mealType));
    if (!id) {
      return null;
    }

    return cloneMealItem(this.itemsById.get(id)!);
  }

  async findMealTypesInRange(userId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; mealType: string }>> {
    return Array.from(this.itemsById.values())
      .filter(
        (item) =>
          item.userId === userId &&
          item.date.getTime() >= startDate.getTime() &&
          item.date.getTime() <= endDate.getTime(),
      )
      .sort((left, right) => {
        const dateCompare = left.date.getTime() - right.date.getTime();
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return left.mealType.localeCompare(right.mealType);
      })
      .map((item) => ({
        date: item.date.toISOString().slice(0, 10),
        mealType: item.mealType,
      }));
  }

  async deleteById(mealItemId: string, _tx?: TransactionClient): Promise<void> {
    const existing = this.itemsById.get(mealItemId);
    if (!existing) {
      return;
    }

    this.idsByKey.delete(keyOf(existing.userId, existing.date, existing.mealType));
    this.itemsById.delete(mealItemId);
  }

  findAll(): MealItem[] {
    return Array.from(this.itemsById.values()).map(cloneMealItem);
  }
}
