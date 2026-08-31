import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { InMemoryMealLogReadModel } from '../test-utils/fakes/InMemoryMealLogReadModel';
import { GetMealCorrelation } from './GetMealCorrelation';

describe('GetMealCorrelation', () => {
  // Freeze the clock so the use-case's date-range window keeps covering the
  // late-August 2026 fixtures as real time moves on.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-25T12:00:00.000Z'), doNotFake: ['nextTick'] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('joins meal totals and body measurements by date', async () => {
    const meals = new InMemoryMealLogReadModel([
      {
        id: '1',
        userId: 'user-1',
        date: new Date('2026-08-24T00:00:00.000Z'),
        mealType: 'dinner',
        entries: [{ name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 }],
        loggedAt: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);
    const measurements = new InMemoryBodyMeasurementRepository([
      {
        id: 'measurement-1',
        userId: 'user-1',
        metric: 'bodyFat',
        value: 19.8,
        unit: '%',
        date: new Date('2026-08-24T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);

    const useCase = new GetMealCorrelation(meals, measurements);
    await expect(useCase.execute('user-1', 'calories', 'bodyFat', 'week')).resolves.toEqual([
      { date: '2026-08-24', x: 320, y: 19.8 },
    ]);
  });
});
