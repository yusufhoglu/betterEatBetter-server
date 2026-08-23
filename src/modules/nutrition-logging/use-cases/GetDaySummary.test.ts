import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { FakeDailyTargetsPort } from '../test-utils/fakes/FakeDailyTargetsPort';
import { GetDaySummary } from './GetDaySummary';

const today = new Date('2026-08-23T00:00:00.000Z');

describe('GetDaySummary', () => {
  it('returns consumed totals even when daily targets are missing', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const useCase = new GetDaySummary(repository, targets);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.consumed).toEqual({ calories: 180, proteinG: 14, carbsG: 2, fatG: 12 });
    expect(summary.dailyCalorieGoal).toBeNull();
    expect(summary.remainingCalories).toBeNull();
    expect(summary.progress.protein.goal).toBeNull();
  });

  it('recomputes totals from all meal items for the day', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    targets.setTargets('user-1', { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 });
    const useCase = new GetDaySummary(repository, targets);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });
    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'dinner',
      entries: [
        { id: 'entry-2', name: 'Chicken', portionGrams: 200, calories: 330, proteinG: 45, carbsG: 0, fatG: 12 },
        { id: 'entry-3', name: 'Rice', portionGrams: 180, calories: 240, proteinG: 4, carbsG: 52, fatG: 1 },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.mealItems).toHaveLength(2);
    expect(summary.consumed).toEqual({ calories: 750, proteinG: 63, carbsG: 54, fatG: 25 });
    expect(summary.remainingCalories).toBe(1450);
  });
});
