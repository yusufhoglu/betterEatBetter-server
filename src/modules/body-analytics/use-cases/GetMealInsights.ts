import type { InsightGeneratorPort } from '../ports/InsightGeneratorPort';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';
import { resolveDateRange } from '../domain/resolveDateRange';

export class GetMealInsights {
  constructor(
    private readonly repository: MealLogReadModelPort,
    private readonly insightGenerator: InsightGeneratorPort,
  ) {}

  async execute(userId: string, range: 'week' | 'month' | 'threeMonths' | 'sixMonths' | 'year' | 'allTime') {
    const { startDate, endDate } = resolveDateRange(range);
    const logs = await this.repository.listForRange(userId, startDate, endDate);
    return this.insightGenerator.generate(logs);
  }
}
