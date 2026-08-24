import { InMemoryMealLogReadModel } from '../test-utils/fakes/InMemoryMealLogReadModel';
import { GetMealBreakdown } from './GetMealBreakdown';

describe('GetMealBreakdown', () => {
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
