import type { FoodItem } from '../domain/FoodEntry';
import type { Locale } from '../../../shared/i18n/locale';

/** What Python/RAG returns for a single photo analysis call. */
export interface PhotoEstimateResult {
  status: 'sufficient' | 'insufficient_data';
  items: FoodItem[];
  /** Raw response for storage in resultJson */
  raw: unknown;
}

export interface PhotoEstimatorPort {
  /**
   * Sends the pending photo URL to the Python RAG service and returns
   * a structured food estimate. Forwards the trace-id header automatically.
   * `locale` is passed through so item names come back in the user's language.
   */
  estimate(photoUrl: string, locale: Locale): Promise<PhotoEstimateResult>;
}
