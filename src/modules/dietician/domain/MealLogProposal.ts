import type { FoodEntry } from '../../food-recognition/domain/FoodEntry';

/**
 * A logging SUGGESTION, never a write — identical contract to chatbot's
 * `MealLogProposal`. `mealType` is deliberately absent: the user always picks
 * it on the mobile side before the real `LogMealEntries` call
 * (nutrition-logging-rule.md). Duplicated rather than shared because a module
 * never imports another module's `domain/` (dietician-rule.md).
 */
export interface MealLogProposal {
  entries: FoodEntry[];
  rawDescription: string;
}
