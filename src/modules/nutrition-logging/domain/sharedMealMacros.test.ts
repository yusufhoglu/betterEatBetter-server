import type { LoggedMealEntry } from './MealItem';
import { sharedMealMacrosFromEntries } from './sharedMealMacros';

const base: Omit<LoggedMealEntry, 'id'> = {
  name: 'x',
  portionGrams: 100,
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};

describe('sharedMealMacrosFromEntries', () => {
  it('sums entries that share a meal photo id', () => {
    const entries: LoggedMealEntry[] = [
      { ...base, id: 'p', mealPhotoId: 'photo-1', source: 'photo', calories: 200, proteinG: 10, carbsG: 20, fatG: 5 },
      { ...base, id: 'q', mealPhotoId: 'photo-1', source: 'photo', calories: 150, proteinG: 8, carbsG: 12, fatG: 4 },
    ];
    expect(sharedMealMacrosFromEntries('u1', entries)).toEqual([
      { userId: 'u1', mealPhotoId: 'photo-1', calories: 350, proteinG: 18, carbsG: 32, fatG: 9 },
    ]);
  });

  it('infers the photo id from a photo-source entry id', () => {
    const entries: LoggedMealEntry[] = [
      { ...base, id: 'photo-2', source: 'photo', calories: 420, proteinG: 32, carbsG: 45, fatG: 12 },
    ];
    expect(sharedMealMacrosFromEntries('u1', entries)).toEqual([
      { userId: 'u1', mealPhotoId: 'photo-2', calories: 420, proteinG: 32, carbsG: 45, fatG: 12 },
    ]);
  });

  it('ignores manual / non-uuid entries', () => {
    const entries: LoggedMealEntry[] = [
      { ...base, id: 'manual-1', source: 'manual', calories: 100 },
    ];
    expect(sharedMealMacrosFromEntries('u1', entries)).toEqual([]);
  });
});
