import type { Locale } from '../../../../shared/i18n/locale';
import type { MealInsightCard, MealLogReadModel } from '../../domain/bodyAnalyticsTypes';
import type { InsightGeneratorPort } from '../../ports/InsightGeneratorPort';

/**
 * Placeholder-free fallback that preserves the future extension point without
 * introducing an LLM dependency in this round.
 */
export class LlmInsightGenerator implements InsightGeneratorPort {
  generate(_logs: MealLogReadModel[], _locale: Locale): MealInsightCard[] {
    return [];
  }
}
