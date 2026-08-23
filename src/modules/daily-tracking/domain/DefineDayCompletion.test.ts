import { defineDayCompletion } from './DefineDayCompletion';

describe('DefineDayCompletion', () => {
  it('returns true when breakfast lunch and dinner are all logged', () => {
    expect(defineDayCompletion(['breakfast', 'lunch', 'dinner'])).toBe(true);
  });

  it('returns true when snack is present in addition to the required meals', () => {
    expect(defineDayCompletion(['snack', 'breakfast', 'lunch', 'dinner'])).toBe(true);
  });

  it('returns false when one required meal is missing', () => {
    expect(defineDayCompletion(['breakfast', 'dinner', 'snack'])).toBe(false);
  });

  it('ignores duplicate meal types', () => {
    expect(defineDayCompletion(['breakfast', 'breakfast', 'lunch', 'dinner'])).toBe(true);
  });
});
