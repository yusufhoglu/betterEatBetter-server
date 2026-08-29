import { parseNutrition } from './PrismaSocialFeedRepository';

describe('parseNutrition', () => {
  it('reads the pre-summarised `macros` shape', () => {
    expect(
      parseNutrition({
        macros: {
          totalCalories: 421.6,
          totalProteinGrams: 31.4,
          totalCarbsGrams: 44.9,
          totalFatGrams: 11.7,
        },
      }),
    ).toEqual({ calories: 422, proteinG: 31, carbsG: 45, fatG: 12 });
  });

  it('sums the stored `items` shape (proteinGrams/carbsGrams/fatGrams)', () => {
    expect(
      parseNutrition({
        items: [
          { calories: 357, proteinGrams: 48, carbsGrams: 0, fatGrams: 17 },
          { calories: 27, proteinGrams: 2, carbsGrams: 5, fatGrams: 0 },
        ],
      }),
    ).toEqual({ calories: 384, proteinG: 50, carbsG: 5, fatG: 17 });
  });

  it('sums the raw RAG `estimate.items` shape (proteinG/carbsG/fatG)', () => {
    expect(
      parseNutrition({
        estimate: {
          items: [
            { calories: 200, proteinG: 10, carbsG: 20, fatG: 5 },
            { calories: 100, proteinG: 5, carbsG: 10, fatG: 2 },
          ],
        },
      }),
    ).toEqual({ calories: 300, proteinG: 15, carbsG: 30, fatG: 7 });
  });

  it('returns null for missing / empty / junk input', () => {
    expect(parseNutrition(null)).toBeNull();
    expect(parseNutrition({})).toBeNull();
    expect(parseNutrition({ items: [] })).toBeNull();
    expect(parseNutrition('nope')).toBeNull();
  });
});
