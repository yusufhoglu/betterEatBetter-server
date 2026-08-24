import { isTrendImprovement } from './trendDirectionMap';

describe('isTrendImprovement', () => {
  it('treats weight gain as good for gain goals', () => {
    expect(isTrendImprovement('weight', 0.4, 'gain')).toBe(true);
    expect(isTrendImprovement('bmi', 0.3, 'gain')).toBe(true);
  });

  it('treats weight loss as good for lose goals', () => {
    expect(isTrendImprovement('weight', -0.4, 'lose')).toBe(true);
    expect(isTrendImprovement('bmi', -0.3, 'lose')).toBe(true);
  });

  it('keeps non-weight metrics independent from goal', () => {
    expect(isTrendImprovement('bodyFat', -0.4, 'gain')).toBe(true);
    expect(isTrendImprovement('waist', 0.4, 'lose')).toBe(false);
    expect(isTrendImprovement('muscleMass', 0.3, 'lose')).toBe(true);
  });
});
