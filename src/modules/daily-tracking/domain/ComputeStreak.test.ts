import { computeStreak } from './ComputeStreak';

describe('ComputeStreak', () => {
  it('returns zero streaks for an empty completion history', () => {
    expect(computeStreak([])).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it('counts a single completed day', () => {
    expect(computeStreak([true])).toEqual({ currentStreak: 1, longestStreak: 1 });
  });

  it('counts the longest run even when the current streak is shorter', () => {
    expect(computeStreak([true, true, false, true])).toEqual({ currentStreak: 1, longestStreak: 2 });
  });

  it('treats the latest incomplete day as not yet breaking the current streak', () => {
    expect(computeStreak([true, true, true, false])).toEqual({ currentStreak: 3, longestStreak: 3 });
  });

  it('stops the carried current streak at the first earlier incomplete day', () => {
    expect(computeStreak([true, false, true, true, false])).toEqual({ currentStreak: 2, longestStreak: 2 });
  });
});
