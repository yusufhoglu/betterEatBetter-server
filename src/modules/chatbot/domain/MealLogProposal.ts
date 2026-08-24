import type { FoodEntry } from '../../food-recognition/domain/FoodEntry';

/**
 * A logging SUGGESTION, never a write. mealType is deliberately absent — the
 * user always picks it on the mobile side before the real LogMealEntries call
 * (nutrition-logging-rule.md: "mealType her zaman kullanıcı seçer"). Entries is
 * an array to stay consistent with LogMealEntries' input contract even though
 * ProposeMealLogTool currently only ever produces one.
 */
export interface MealLogProposal {
  entries: FoodEntry[];
  rawDescription: string;
}
