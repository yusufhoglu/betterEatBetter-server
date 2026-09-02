import type { Locale } from '../../../shared/i18n/locale';
import type { MealInsightCard, MealLogReadModel } from '../domain/bodyAnalyticsTypes';

export interface InsightGeneratorPort {
  generate(logs: MealLogReadModel[], locale: Locale): MealInsightCard[];
}
