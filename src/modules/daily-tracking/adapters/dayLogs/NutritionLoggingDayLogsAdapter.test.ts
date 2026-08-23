import { InMemoryMealItemRepository } from '../../../nutrition-logging/test-utils/fakes/InMemoryMealItemRepository';
import { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { NutritionLoggingDayLogsAdapter } from './NutritionLoggingDayLogsAdapter';

describe('NutritionLoggingDayLogsAdapter', () => {
  it('delegates to the nutrition-logging public range use-case', async () => {
    const repository = new InMemoryMealItemRepository();
    const useCase = new GetLoggedMealTypesForDateRange(repository);
    const adapter = new NutritionLoggingDayLogsAdapter(useCase);

    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Oats', portionGrams: 80, calories: 280, proteinG: 10, carbsG: 48, fatG: 5 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-21T00:00:00.000Z'),
      mealType: 'dinner',
      entries: [
        { id: 'entry-2', name: 'Fish', portionGrams: 150, calories: 260, proteinG: 34, carbsG: 0, fatG: 12 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: new Date('2026-08-22T00:00:00.000Z'),
      mealType: 'snack',
      entries: [
        { id: 'entry-3', name: 'Banana', portionGrams: 120, calories: 105, proteinG: 1, carbsG: 27, fatG: 0 },
      ],
    });

    await expect(
      adapter.getLoggedMealTypesForDateRange({
        userId: 'user-1',
        startDate: new Date('2026-08-21T00:00:00.000Z'),
        endDate: new Date('2026-08-22T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      '2026-08-21': ['breakfast', 'dinner'],
      '2026-08-22': ['snack'],
    });
  });
});
