import type { MealRating } from './MealRating';
import type { Recipe } from './Recipe';

/** Prefixes marking a persisted assistant message that carries a rating/recipe card. Same trick as `proposalMessageCodec.ts`. */
export const RATING_MESSAGE_PREFIX = '__DIETICIAN_RATING__:';
export const RECIPE_MESSAGE_PREFIX = '__DIETICIAN_RECIPE__:';

export function encodeRatingMessage(rating: MealRating): string {
  return `${RATING_MESSAGE_PREFIX}${JSON.stringify(rating)}`;
}

export function decodeRatingMessage(content: string): MealRating | null {
  if (!content.startsWith(RATING_MESSAGE_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(content.slice(RATING_MESSAGE_PREFIX.length)) as MealRating;
  } catch {
    return null;
  }
}

export function encodeRecipeMessage(recipe: Recipe): string {
  return `${RECIPE_MESSAGE_PREFIX}${JSON.stringify(recipe)}`;
}

export function decodeRecipeMessage(content: string): Recipe | null {
  if (!content.startsWith(RECIPE_MESSAGE_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(content.slice(RECIPE_MESSAGE_PREFIX.length)) as Recipe;
  } catch {
    return null;
  }
}
