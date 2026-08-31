import type { TransactionClient } from '../../../shared/persistence/transaction';

/** Fresh nutrition totals for one meal-photo that the author has shared. */
export interface SharedMealMacros {
  userId: string;
  mealPhotoId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * A driven port: when a logged meal that has been shared to the Social feed is
 * edited, the feed's denormalized macro columns must follow. The
 * `nutrition-logging` module owns this interface; the `social` module provides
 * the adapter, wired in the route composition. Implementations must be a no-op
 * when the meal photo was never shared.
 */
export interface SharedMealPort {
  syncMacros(updates: SharedMealMacros[], tx: TransactionClient): Promise<void>;
}

/** Default used everywhere the sync isn't wired (tests, and if social is off). */
export const noopSharedMealPort: SharedMealPort = {
  async syncMacros() {
    /* nothing shared to keep in sync */
  },
};
