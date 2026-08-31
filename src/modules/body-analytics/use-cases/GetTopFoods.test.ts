import { InMemoryMealLogReadModel } from '../test-utils/fakes/InMemoryMealLogReadModel';
import { GetTopFoods } from './GetTopFoods';

describe('GetTopFoods', () => {
  // Freeze the clock so the use-case's date-range window keeps covering the
  // late-August 2026 fixtures as real time moves on.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-25T12:00:00.000Z'), doNotFake: ['nextTick'] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns the most frequently logged foods', async () => {
    const useCase = new GetTopFoods(
      new InMemoryMealLogReadModel([
        {
          id: '1',
          userId: 'user-1',
          date: new Date('2026-08-23T00:00:00.000Z'),
          mealType: 'lunch',
          entries: [{ name: 'Chicken Rice Bowl', source: 'manual', portionGrams: 100, calories: 350, proteinG: 30, carbsG: 35, fatG: 8 }],
          loggedAt: new Date('2026-08-23T00:00:00.000Z'),
        },
        {
          id: '2',
          userId: 'user-1',
          date: new Date('2026-08-24T00:00:00.000Z'),
          mealType: 'lunch',
          entries: [{ name: 'Chicken Rice Bowl', source: 'manual', portionGrams: 100, calories: 350, proteinG: 30, carbsG: 35, fatG: 8 }],
          loggedAt: new Date('2026-08-24T00:00:00.000Z'),
        },
      ]),
    );

    const result = await useCase.execute('user-1', 'week');
    expect(result[0]).toEqual({ name: 'Chicken Rice Bowl', logCount: 2, mealSlot: 'lunch' });
  });
});
