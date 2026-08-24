import { computeGoalProgressFraction } from './computeGoalProgressFraction';

describe('computeGoalProgressFraction', () => {
  it('returns null when no target exists', () => {
    expect(computeGoalProgressFraction(80, 78, null)).toBeNull();
  });

  it('clamps the progress into the 0..1 range', () => {
    expect(computeGoalProgressFraction(80, 75, 70)).toBeCloseTo(0.5);
    expect(computeGoalProgressFraction(80, 65, 70)).toBe(1);
    expect(computeGoalProgressFraction(80, 90, 70)).toBe(0);
  });

  it('handles identical start and target values safely', () => {
    expect(computeGoalProgressFraction(75, 75, 75)).toBe(1);
    expect(computeGoalProgressFraction(75, 74, 75)).toBe(0);
  });
});
