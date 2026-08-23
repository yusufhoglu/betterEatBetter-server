import { AggregateMealEntries } from './AggregateMealEntries';

describe('AggregateMealEntries', () => {
  it('returns zero totals for an empty entry list', () => {
    expect(AggregateMealEntries([])).toEqual({
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });

  it('returns the entry values for a single entry', () => {
    expect(
      AggregateMealEntries([
        {
          id: 'entry-1',
          name: 'Eggs',
          portionGrams: 120,
          calories: 180,
          proteinG: 14,
          carbsG: 2,
          fatG: 12,
        },
      ]),
    ).toEqual({
      calories: 180,
      proteinG: 14,
      carbsG: 2,
      fatG: 12,
    });
  });

  it('sums multiple entries', () => {
    expect(
      AggregateMealEntries([
        {
          id: 'entry-1',
          name: 'Eggs',
          portionGrams: 120,
          calories: 180,
          proteinG: 14,
          carbsG: 2,
          fatG: 12,
        },
        {
          id: 'entry-2',
          name: 'Toast',
          portionGrams: 60,
          calories: 160,
          proteinG: 5,
          carbsG: 28,
          fatG: 2,
        },
      ]),
    ).toEqual({
      calories: 340,
      proteinG: 19,
      carbsG: 30,
      fatG: 14,
    });
  });
});
