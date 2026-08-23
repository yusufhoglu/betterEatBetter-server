import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

export class GetLoggedMealTypesForDateRange {
  constructor(private readonly repository: MealItemRepositoryPort) {}

  async execute(userId: string, startDate: Date, endDate: Date): Promise<Record<string, string[]>> {
    const rows = await this.repository.findMealTypesInRange(userId, startDate, endDate);

    return rows.reduce<Record<string, string[]>>((grouped, row) => {
      grouped[row.date] ??= [];
      grouped[row.date]!.push(row.mealType);
      return grouped;
    }, {});
  }
}
