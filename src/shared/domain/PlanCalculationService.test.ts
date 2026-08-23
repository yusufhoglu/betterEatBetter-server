import {
  computeBMR,
  computeDailyCalorieTarget,
  computeMacroSplit,
  computePlan,
  computeTDEE,
} from './PlanCalculationService';

describe('PlanCalculationService', () => {
  describe('computeBMR()', () => {
    it('computes BMR for a male using the Mifflin-St Jeor formula', () => {
      // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
      expect(computeBMR({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' })).toBe(1780);
    });

    it('computes BMR for a female using the Mifflin-St Jeor formula', () => {
      // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161
      expect(computeBMR({ weightKg: 60, heightCm: 165, age: 25, gender: 'female' })).toBe(1345.25);
    });
  });

  describe('computeTDEE()', () => {
    const bmr = 1000;

    it('applies ×1.2 for 0 workouts per week', () => {
      expect(computeTDEE(bmr, 0)).toBe(1200);
    });

    it('applies ×1.375 at the low boundary (1 workout)', () => {
      expect(computeTDEE(bmr, 1)).toBe(1375);
    });

    it('applies ×1.375 at the high boundary (3 workouts, inclusive)', () => {
      expect(computeTDEE(bmr, 3)).toBe(1375);
    });

    it('applies ×1.55 at the high boundary (5 workouts, inclusive)', () => {
      expect(computeTDEE(bmr, 5)).toBe(1550);
    });

    it('applies ×1.725 at the high boundary (7 workouts, inclusive)', () => {
      expect(computeTDEE(bmr, 7)).toBe(1725);
    });

    it('applies ×1.9 for more than 7 workouts', () => {
      expect(computeTDEE(bmr, 10)).toBe(1900);
    });
  });

  describe('computeDailyCalorieTarget()', () => {
    it('never drops the result below 1200, even with a low TDEE and goal=lose', () => {
      expect(computeDailyCalorieTarget(1300, 'lose', 1)).toBe(1200);
    });

    it('silently clamps a weeklyPaceKg above 1 down to 1', () => {
      const clamped = computeDailyCalorieTarget(2500, 'lose', 3);
      const atMax = computeDailyCalorieTarget(2500, 'lose', 1);
      expect(clamped).toBe(atMax);
      expect(clamped).toBe(1400);
    });

    it('returns exactly the TDEE for goal=maintain (no clamp involved)', () => {
      expect(computeDailyCalorieTarget(2200, 'maintain', 0.5)).toBe(2200);
    });
  });

  describe('computeMacroSplit()', () => {
    it('sets protein to 2g/kg and splits the remaining calories 50/50 between carbs and fat', () => {
      expect(computeMacroSplit(2000, 70)).toEqual({ proteinG: 140, carbsG: 180, fatG: 80 });
    });

    it('clamps the remaining calories to 0 when protein alone exceeds dailyCalories', () => {
      // proteinG = 140 -> 560 kcal, which already exceeds the 400 kcal budget
      expect(computeMacroSplit(400, 70)).toEqual({ proteinG: 140, carbsG: 0, fatG: 0 });
    });
  });

  describe('computePlan()', () => {
    it('chains BMR -> TDEE -> calorie target -> macro split into one consistent result', () => {
      const result = computePlan({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        workoutsPerWeek: 3,
        goal: 'lose',
        weeklyPaceKg: 0.5,
      });

      expect(result).toEqual({ dailyCalories: 1898, proteinG: 160, carbsG: 157, fatG: 70 });
    });
  });
});
