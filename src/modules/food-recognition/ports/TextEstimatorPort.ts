import type { FoodItem, MacroSummary } from '../domain/FoodEntry';
import type { Locale } from '../../../shared/i18n/locale';

/** What the LLM returns for a free-text food description. */
export interface TextEstimateResult {
  status: 'sufficient' | 'insufficient_data';
  items: FoodItem[];
  macros: MacroSummary;
}

export interface TextEstimatorPort {
  /**
   * Sends a free-text food description to the LLM and returns a structured
   * food estimate. Uses the same response schema as PhotoEstimatorPort so
   * ConfidencePolicy works for both flows. `locale`, when given, steers the
   * language of returned item names; omitted (e.g. dietician tool callers
   * with no request-level locale) falls back to mirroring the input text's
   * own language.
   */
  estimate(text: string, locale?: Locale): Promise<TextEstimateResult>;
}
