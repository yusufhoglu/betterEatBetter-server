import type { LoggedMealEntry } from '../domain/MealItem';
import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { GetMealHistory } from './GetMealHistory';

function entry(over: Partial<LoggedMealEntry> = {}): LoggedMealEntry {
  return {
    id: 'e1',
    name: 'Food',
    portionGrams: 100,
    calories: 200,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    ...over,
  };
}

async function seed(repo: InMemoryMealItemRepository) {
  await repo.appendEntries({
    userId: 'u1',
    date: new Date('2026-08-27T00:00:00.000Z'),
    mealType: 'breakfast',
    entries: [entry({ id: 'a', name: 'Oatmeal' }), entry({ id: 'b', name: 'Berries', calories: 60 })],
  });
  await repo.appendEntries({
    userId: 'u1',
    date: new Date('2026-08-28T00:00:00.000Z'),
    mealType: 'lunch',
    entries: [entry({ id: 'c', name: 'Chicken bowl', calories: 540, mealPhotoId: 'photo-1' })],
  });
  await repo.appendEntries({
    userId: 'other',
    date: new Date('2026-08-28T00:00:00.000Z'),
    mealType: 'dinner',
    entries: [entry()],
  });
}

describe('GetMealHistory', () => {
  it('returns the user\'s slots newest-first with summed macros', async () => {
    const repo = new InMemoryMealItemRepository();
    await seed(repo);

    const history = await new GetMealHistory(repo).execute({ userId: 'u1' });

    expect(history.map((s) => `${s.date} ${s.mealType}`)).toEqual([
      '2026-08-28 lunch',
      '2026-08-27 breakfast',
    ]);
    expect(history[0]).toMatchObject({
      calories: 540,
      items: ['Chicken bowl'],
    });
    expect(typeof history[0]?.photoUrl).toBe('string'); // photo-scanned item
    expect(history[1]).toMatchObject({
      calories: 260,
      proteinG: 20,
      carbsG: 40,
      fatG: 10,
      items: ['Oatmeal', 'Berries'],
      photoUrl: null,
    });
  });

  it('honours the limit', async () => {
    const repo = new InMemoryMealItemRepository();
    await seed(repo);
    const history = await new GetMealHistory(repo).execute({ userId: 'u1', limit: 1 });
    expect(history).toHaveLength(1);
  });
});
