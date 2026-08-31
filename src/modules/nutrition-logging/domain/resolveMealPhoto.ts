import type { LoggedMealEntry } from './MealItem';

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inferMealPhotoId(entry: LoggedMealEntry): string | undefined {
  if (entry.mealPhotoId) {
    return entry.mealPhotoId;
  }

  if (entry.source === 'photo') {
    return entry.id;
  }

  return UUID_LIKE_PATTERN.test(entry.id) ? entry.id : undefined;
}
