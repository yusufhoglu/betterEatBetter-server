import type { FoodItem, MacroSummary } from '../domain/FoodEntry';

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
   * ConfidencePolicy works for both flows.
   */
  estimate(text: string): Promise<TextEstimateResult>;
}
