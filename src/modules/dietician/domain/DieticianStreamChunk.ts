import type { MealLogProposal } from './MealLogProposal';
import type { MealRating } from './MealRating';
import type { Recipe } from './Recipe';

/**
 * What `RunDieticianTurn` yields. The controller maps each variant to its own
 * SSE event so mobile renders a text bubble vs. a proposal/rating/recipe card.
 */
export type DieticianStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'proposal'; proposal: MealLogProposal }
  | { type: 'rating'; rating: MealRating }
  | { type: 'recipe'; recipe: Recipe };
