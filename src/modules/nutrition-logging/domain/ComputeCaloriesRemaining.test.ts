import { ComputeCaloriesRemaining } from './ComputeCaloriesRemaining';

describe('ComputeCaloriesRemaining', () => {
  it('subtracts consumed calories from the goal', () => {
    expect(ComputeCaloriesRemaining(2200, 1700)).toBe(500);
  });

  it('clamps remaining calories at zero', () => {
    expect(ComputeCaloriesRemaining(2200, 2400)).toBe(0);
  });

  it('returns null when no goal exists', () => {
    expect(ComputeCaloriesRemaining(null, 1200)).toBeNull();
  });
});
