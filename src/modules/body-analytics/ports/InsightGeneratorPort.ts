import type { MealInsightCard, MealLogReadModel } from '../domain/bodyAnalyticsTypes';

export interface InsightGeneratorPort {
  generate(logs: MealLogReadModel[]): MealInsightCard[];
}
