import { InMemoryMealLogReadModel } from '../test-utils/fakes/InMemoryMealLogReadModel';
import { GetMealAverages } from './GetMealAverages';

describe('GetMealAverages', () => {
  it('computes per-day meal averages for the selected range', async () => {
    const useCase = new GetMealAverages(
      new InMemoryMealLogReadModel([
        {
          id: '1',
          userId: 'user-1',
          date: new Date('2026-08-23T00:00:00.000Z'),
          mealType: 'breakfast',
          entries: [{ name: 'Eggs', source: 'manual', portionGrams: 100, calories: 200, proteinG: 18, carbsG: 2, fatG: 14 }],
          loggedAt: new Date('2026-08-23T00:00:00.000Z'),
        },
        {
          id: '2',
          userId: 'user-1',
          date: new Date('2026-08-24T00:00:00.000Z'),
          mealType: 'dinner',
          entries: [{ name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
          loggedAt: new Date('2026-08-24T00:00:00.000Z'),
        },
      ]),
    );

    await expect(useCase.execute('user-1', 'week')).resolves.toEqual({
      caloriesAvg: 260,
      proteinAvgG: 29,
      carbsAvgG: 1,
      fiberAvgG: null,
    });
  });
});
