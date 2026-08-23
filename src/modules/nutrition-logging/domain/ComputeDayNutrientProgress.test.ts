import { ComputeDayNutrientProgress } from './ComputeDayNutrientProgress';

describe('ComputeDayNutrientProgress', () => {
  it('computes consumed, goal, and remaining values when targets exist', () => {
    expect(
      ComputeDayNutrientProgress(
        { calories: 1600, proteinG: 120, carbsG: 140, fatG: 55 },
        { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
      ),
    ).toEqual({
      calories: { consumed: 1600, goal: 2200, remaining: 600 },
      protein: { consumed: 120, goal: 160, remaining: 40 },
      carbs: { consumed: 140, goal: 220, remaining: 80 },
      fat: { consumed: 55, goal: 70, remaining: 15 },
    });
  });

  it('returns null goal and remaining values when targets are missing', () => {
    expect(
      ComputeDayNutrientProgress(
        { calories: 1600, proteinG: 120, carbsG: 140, fatG: 55 },
        null,
      ),
    ).toEqual({
      calories: { consumed: 1600, goal: null, remaining: null },
      protein: { consumed: 120, goal: null, remaining: null },
      carbs: { consumed: 140, goal: null, remaining: null },
      fat: { consumed: 55, goal: null, remaining: null },
    });
  });
});
