import type { FoodEntry } from '../domain/FoodEntry';

/**
 * IMPORTANT: Only used by the `RecognizeFromPhoto` use case (async flow).
 * Barcode, text, and search flows are synchronous — results are returned
 * directly in the HTTP response without any persistent storage.
 */
export interface FoodEntryRepositoryPort {
  /** Creates a new food_entry with `status: 'processing'`. */
  create(entry: Pick<FoodEntry, 'id' | 'userId' | 'status'>): Promise<void>;

  /** Updates the status and result after the recognition job completes. */
  updateResult(
    id: string,
    update: {
      status: FoodEntry['status'];
      items?: FoodEntry['items'];
      macros?: FoodEntry['macros'];
      needsUserAction?: boolean;
      resultJson?: unknown;
      errorCode?: string;
    },
  ): Promise<void>;

  /** Retrieves a food entry for polling. */
  findById(id: string): Promise<FoodEntry | null>;
}
