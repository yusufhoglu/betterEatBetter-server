import type { FoodEntry } from '../../domain/FoodEntry';
import type { FoodEntryRepositoryPort } from '../../ports/FoodEntryRepositoryPort';

/**
 * In-memory implementation of FoodEntryRepositoryPort for use in unit tests.
 * Provides a `findAll()` helper for test assertions.
 */
export class InMemoryFoodEntryRepository implements FoodEntryRepositoryPort {
  private readonly entries = new Map<string, FoodEntry>();

  async create(entry: Pick<FoodEntry, 'id' | 'userId' | 'status'>): Promise<void> {
    this.entries.set(entry.id, {
      id: entry.id,
      userId: entry.userId,
      source: 'photo',
      status: entry.status,
      items: [],
      macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
      needsUserAction: false,
      createdAt: new Date(),
    });
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
    const existing = this.entries.get(id);
    if (!existing) return;
    this.entries.set(id, {
      ...existing,
      ...update,
      items: update.items ?? existing.items,
      macros: update.macros ?? existing.macros,
      needsUserAction: update.needsUserAction ?? existing.needsUserAction,
    });
  }

  async findById(id: string): Promise<FoodEntry | null> {
    return this.entries.get(id) ?? null;
  }

  /** Test helper — returns all stored entries. */
  findAll(): FoodEntry[] {
    return Array.from(this.entries.values());
  }

  /** Test helper — clears all data. */
  clear(): void {
    this.entries.clear();
  }
}
