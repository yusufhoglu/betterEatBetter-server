import {
  computeBMR,
  computeBodyComposition,
  computeDailyCalorieTarget,
  computeDeurenbergBodyFatPct,
  computeMacroSplit,
  computeNavyBodyFatPct,
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

    it('switches to the Katch-McArdle formula when lean body mass is supplied', () => {
      // 370 + 21.6 * 64 = 370 + 1382.4
      expect(computeBMR({ weightKg: 80, heightCm: 180, age: 30, gender: 'male', leanBodyMassKg: 64 })).toBeCloseTo(1752.4);
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

  describe('computeDeurenbergBodyFatPct()', () => {
    it('estimates body fat from BMI, age and sex', () => {
      // bmi = 80 / 1.8^2 = 24.691..; 1.2*bmi + 0.23*30 - 10.8*1 - 5.4
      expect(computeDeurenbergBodyFatPct({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' })).toBeCloseTo(20.3, 1);
    });

    it('returns a higher figure for a female than a male at the same BMI/age', () => {
      const male = computeDeurenbergBodyFatPct({ weightKg: 70, heightCm: 175, age: 35, gender: 'male' });
      const female = computeDeurenbergBodyFatPct({ weightKg: 70, heightCm: 175, age: 35, gender: 'female' });
      expect(female).toBeGreaterThan(male);
    });

    it('clamps implausible results into the [5, 60] band', () => {
      const veryLean = computeDeurenbergBodyFatPct({ weightKg: 50, heightCm: 190, age: 18, gender: 'male' });
      expect(veryLean).toBeGreaterThanOrEqual(5);
    });
  });

  describe('computeNavyBodyFatPct()', () => {
    it('estimates male body fat from waist and neck', () => {
      expect(computeNavyBodyFatPct({ heightCm: 180, gender: 'male', waistCm: 90, neckCm: 40 })).toBeCloseTo(18.5, 1);
    });

    it('needs the hip measurement for a female', () => {
      expect(computeNavyBodyFatPct({ heightCm: 165, gender: 'female', waistCm: 75, neckCm: 33 })).toBeNull();
      expect(
        computeNavyBodyFatPct({ heightCm: 165, gender: 'female', waistCm: 75, neckCm: 33, hipCm: 98 }),
      ).toBeGreaterThan(0);
    });

    it('returns null when a required measurement is missing or geometrically invalid', () => {
      expect(computeNavyBodyFatPct({ heightCm: 180, gender: 'male', waistCm: 90 })).toBeNull();
      expect(computeNavyBodyFatPct({ heightCm: 180, gender: 'male', waistCm: 38, neckCm: 40 })).toBeNull();
    });
  });

  describe('computeBodyComposition()', () => {
    it('falls back to Deurenberg and flags fromMeasurements=false when no tape data is given', () => {
      const result = computeBodyComposition({ weightKg: 80, heightCm: 180, age: 30, gender: 'male' });
      expect(result.fromMeasurements).toBe(false);
      expect(result.bodyFatPct).toBeCloseTo(20.3, 1);
      expect(result.leanBodyMassKg).toBeCloseTo(80 * (1 - result.bodyFatPct / 100), 0);
    });

    it('prefers the Navy estimate and flags fromMeasurements=true when tape data is valid', () => {
      const result = computeBodyComposition({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        waistCm: 90,
        neckCm: 40,
      });
      expect(result.fromMeasurements).toBe(true);
      expect(result.bodyFatPct).toBeCloseTo(18.5, 1);
    });
  });

  describe('computeMacroSplit()', () => {
    it('sets protein to 2g/kg bodyweight, fat to the 0.8g/kg floor, and gives carbs the rest', () => {
      // protein 140g (560 kcal), fat max(2000*0.25/9=55.5, 56) -> 56g (504 kcal),
      // carbs (2000 - 560 - 504) / 4 = 234
      expect(computeMacroSplit(2000, 70)).toEqual({ proteinG: 140, carbsG: 234, fatG: 56 });
    });

    it('scales protein from lean body mass when it is known, bounded to 1.6-2.2 g/kg bodyweight', () => {
      // LBM 60 -> 2*60 = 120g, within [1.6*80=128 .. 2.2*80=176] lower bound wins -> 128
      expect(computeMacroSplit(2200, 80, 60)).toMatchObject({ proteinG: 128 });
    });

    it('clamps carbs to 0 when protein plus the fat floor already exceed the calorie budget', () => {
      expect(computeMacroSplit(400, 70)).toEqual({ proteinG: 140, carbsG: 0, fatG: 56 });
    });
  });

  describe('computePlan()', () => {
    it('chains body composition -> BMR -> TDEE -> calorie target -> macro split into one result', () => {
      const result = computePlan({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        workoutsPerWeek: 3,
        goal: 'lose',
        weeklyPaceKg: 0.5,
      });

      expect(result).toEqual({
        dailyCalories: 1898,
        proteinG: 128,
        carbsG: 203,
        fatG: 64,
        bodyFatPct: 20.3,
        leanBodyMassKg: 63.7,
      });
    });

    it('shifts the macros when tape measurements switch it onto the Navy estimate', () => {
      const withoutTape = computePlan({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        workoutsPerWeek: 3,
        goal: 'lose',
        weeklyPaceKg: 0.5,
      });
      const withTape = computePlan({
        weightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        workoutsPerWeek: 3,
        goal: 'lose',
        weeklyPaceKg: 0.5,
        waistCm: 90,
        neckCm: 40,
      });

      expect(withTape.bodyFatPct).not.toBe(withoutTape.bodyFatPct);
      expect(withTape.proteinG).not.toBe(withoutTape.proteinG);
    });
  });
});
