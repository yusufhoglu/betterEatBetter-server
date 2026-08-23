import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { GetLoggedMealTypesForDateRange } from './GetLoggedMealTypesForDateRange';

describe('GetLoggedMealTypesForDateRange', () => {
  it('groups logged meal types by ISO date across multiple days', async () => {
    const repository = new InMemoryMealItemRepository();
    const useCase = new GetLoggedMealTypesForDateRange(repository);

    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-20T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 100, calories: 150, proteinG: 12, carbsG: 1, fatG: 10 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-20T00:00:00.000Z'),
      mealType: 'dinner',
      entries: [
        { id: 'entry-2', name: 'Chicken', portionGrams: 180, calories: 300, proteinG: 40, carbsG: 0, fatG: 10 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-22T00:00:00.000Z'),
      mealType: 'snack',
      entries: [
        { id: 'entry-3', name: 'Yogurt', portionGrams: 120, calories: 110, proteinG: 8, carbsG: 10, fatG: 3 },
      ],
    });
    await repository.appendEntries({
      userId: 'other-user',
      date: new Date('2026-08-20T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [
        { id: 'entry-4', name: 'Rice', portionGrams: 180, calories: 240, proteinG: 4, carbsG: 52, fatG: 1 },
      ],
    });

    await expect(
      useCase.execute(
        'user-1',
        new Date('2026-08-20T00:00:00.000Z'),
        new Date('2026-08-22T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      '2026-08-20': ['breakfast', 'dinner'],
      '2026-08-22': ['snack'],
    });
  });

  it('returns an empty object for an empty range result', async () => {
    const repository = new InMemoryMealItemRepository();
    const useCase = new GetLoggedMealTypesForDateRange(repository);

    await expect(
      useCase.execute(
        'user-1',
        new Date('2026-08-20T00:00:00.000Z'),
        new Date('2026-08-22T00:00:00.000Z'),
      ),
    ).resolves.toEqual({});
  });

  it('returns only that day for a single-day range', async () => {
    const repository = new InMemoryMealItemRepository();
    const useCase = new GetLoggedMealTypesForDateRange(repository);

    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'lunch',
      entries: [
        { id: 'entry-1', name: 'Salad', portionGrams: 150, calories: 180, proteinG: 6, carbsG: 12, fatG: 10 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'snack',
      entries: [
        { id: 'entry-2', name: 'Apple', portionGrams: 100, calories: 52, proteinG: 0, carbsG: 14, fatG: 0 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-22T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-3', name: 'Toast', portionGrams: 60, calories: 160, proteinG: 5, carbsG: 28, fatG: 2 },
      ],
    });

    await expect(
      useCase.execute(
        'user-1',
        new Date('2026-08-21T00:00:00.000Z'),
        new Date('2026-08-21T00:00:00.000Z'),
      ),
    ).resolves.toEqual({
      '2026-08-21': ['lunch', 'snack'],
    });
  });
});
