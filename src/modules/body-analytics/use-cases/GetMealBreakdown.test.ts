import { InMemoryMealLogReadModel } from '../test-utils/fakes/InMemoryMealLogReadModel';
import { GetMealBreakdown } from './GetMealBreakdown';

describe('GetMealBreakdown', () => {
  // The fixtures below sit in late August 2026; freeze the clock so the
  // use-case's "last 7 days" window keeps covering them as real time moves on.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-25T12:00:00.000Z'), doNotFake: ['nextTick'] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('groups totals by meal slot', async () => {
    const useCase = new GetMealBreakdown(
      new InMemoryMealLogReadModel([
        {
          id: '1',
          userId: 'user-1',
          date: new Date('2026-08-24T00:00:00.000Z'),
          mealType: 'breakfast',
          entries: [{ name: 'Eggs', source: 'manual', portionGrams: 100, calories: 200, proteinG: 18, carbsG: 2, fatG: 14 }],
          loggedAt: new Date('2026-08-24T00:00:00.000Z'),
        },
      ]),
    );

    await expect(useCase.execute('user-1', 'week')).resolves.toEqual([
      { mealSlot: 'breakfast', calories: 200, proteinG: 18, carbsG: 2, fatG: 14 },
    ]);
  });
});
