import type { MealLogReadModel } from '../../domain/bodyAnalyticsTypes';
import type { DeleteMealLogInput, MealLogReadModelPort, UpsertMealLogInput } from '../../ports/MealLogReadModelPort';

export class InMemoryMealLogReadModel implements MealLogReadModelPort {
  constructor(private readonly logs: MealLogReadModel[] = []) {}

  async upsert(input: UpsertMealLogInput): Promise<MealLogReadModel> {
    const existing = this.logs.find(
      (log) =>
        log.userId === input.userId &&
        log.mealType === input.mealType &&
        log.date.toISOString().slice(0, 10) === input.date.toISOString().slice(0, 10),
    );

    if (existing) {
      existing.entries = input.entries;
      return existing;
    }

    const created: MealLogReadModel = {
      id: `meal-log-${this.logs.length + 1}`,
      loggedAt: new Date('2026-08-24T00:00:00.000Z'),
      ...input,
    };
    this.logs.push(created);
    return created;
  }

  async delete(input: DeleteMealLogInput): Promise<void> {
    const index = this.logs.findIndex(
      (log) =>
        log.userId === input.userId &&
        log.mealType === input.mealType &&
        log.date.toISOString().slice(0, 10) === input.date.toISOString().slice(0, 10),
    );

    if (index >= 0) {
      this.logs.splice(index, 1);
    }
  }

  async listForRange(userId: string, startDate: Date | null, endDate: Date): Promise<MealLogReadModel[]> {
    return this.logs
      .filter((log) => {
        if (log.userId !== userId) {
          return false;
        }

        if (startDate && log.date < startDate) {
          return false;
        }

        return log.date <= endDate;
      })
      .sort((left, right) => left.date.getTime() - right.date.getTime());
  }
}
