import type { MealItem } from '../domain/MealItem';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

/**
 * Public entry point for cross-day analytics (practice module): every logged
 * meal slot in an inclusive date range, oldest first, without photo URLs.
 */
export class GetMealItemsForRange {
  constructor(private readonly repository: MealItemRepositoryPort) {}

  execute(userId: string, startDate: Date, endDate: Date): Promise<MealItem[]> {
    return this.repository.findByUserIdInRange(userId, startDate, endDate);
  }
}
