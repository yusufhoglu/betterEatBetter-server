import type { FoodItem } from '../domain/FoodEntry';

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
   */
  estimate(photoUrl: string): Promise<PhotoEstimateResult>;
}
