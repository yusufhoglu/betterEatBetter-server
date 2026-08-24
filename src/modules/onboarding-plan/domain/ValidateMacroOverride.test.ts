import { ValidateMacroOverride } from './ValidateMacroOverride';

describe('ValidateMacroOverride', () => {
  test('accepts a complete override when calories and macros are aligned', () => {
    expect(() =>
      ValidateMacroOverride({
        dailyCalories: 2100,
        proteinG: 180,
        carbsG: 180,
        fatG: 64,
      }),
    ).not.toThrow();
  });

  test('rejects overrides with calories far away from macro calories', () => {
    expect(() =>
      ValidateMacroOverride({
        dailyCalories: 2100,
        proteinG: 50,
        carbsG: 50,
        fatG: 20,
      }),
    ).toThrow('Macro calories must stay reasonably aligned with dailyCalories');
  });
});
