import type { LoggedMealEntry } from './MealItem';
import { inferMealPhotoId } from './resolveMealPhoto';
import type { SharedMealMacros } from '../ports/SharedMealPort';

/**
 * Roll a meal slot's entries up into one macro total per meal-photo. A photo
 * scan can land as several entries (one per recognised item) that all carry the
 * same `mealPhotoId`; the shared post shows their sum, so that's what we sync.
 * Entries with no inferable photo id (manual / barcode) are ignored.
 */
export function sharedMealMacrosFromEntries(
  userId: string,
  entries: LoggedMealEntry[],
): SharedMealMacros[] {
  const byPhoto = new Map<string, SharedMealMacros>();
  for (const entry of entries) {
    const mealPhotoId = inferMealPhotoId(entry);
    if (!mealPhotoId) {
      continue;
    }
    const acc = byPhoto.get(mealPhotoId) ?? {
      userId,
      mealPhotoId,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    };
    acc.calories += entry.calories;
    acc.proteinG += entry.proteinG;
    acc.carbsG += entry.carbsG;
    acc.fatG += entry.fatG;
    byPhoto.set(mealPhotoId, acc);
  }
  return [...byPhoto.values()].map((m) => ({
    ...m,
    calories: Math.round(m.calories),
    proteinG: Math.round(m.proteinG),
    carbsG: Math.round(m.carbsG),
    fatG: Math.round(m.fatG),
  }));
}
