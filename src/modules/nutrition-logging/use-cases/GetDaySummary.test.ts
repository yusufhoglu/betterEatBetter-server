import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { FakeDailyTargetsPort } from '../test-utils/fakes/FakeDailyTargetsPort';
import { GetDaySummary } from './GetDaySummary';

const today = new Date('2026-08-23T00:00:00.000Z');

describe('GetDaySummary', () => {
  it('returns consumed totals even when daily targets are missing', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const useCase = new GetDaySummary(repository, targets, async () => 'https://photos.example/entry-1.jpg');

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: 'entry-1',
          name: 'Eggs',
          source: 'photo',
          portionGrams: 120,
          calories: 180,
          proteinG: 14,
          carbsG: 2,
          fatG: 12,
        },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.consumed).toEqual({ calories: 180, proteinG: 14, carbsG: 2, fatG: 12 });
    expect(summary.mealItems[0]?.photoUrl).toBe('https://photos.example/entry-1.jpg');
    expect(summary.mealItems[0]?.imageUrl).toBe('https://photos.example/entry-1.jpg');
    expect(summary.mealItems[0]?.photoUrls).toEqual(['https://photos.example/entry-1.jpg']);
    expect(summary.mealItems[0]?.entries[0]?.photoUrl).toBe('https://photos.example/entry-1.jpg');
    expect(summary.mealItems[0]?.entries[0]?.imageUrl).toBe('https://photos.example/entry-1.jpg');
    expect(summary.dailyCalorieGoal).toBeNull();
    expect(summary.remainingCalories).toBeNull();
    expect(summary.progress.protein.goal).toBeNull();
  });

  it('re-signs persisted photo-backed entries from meal slot entries', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const photoUrlResolver = jest.fn(async () => 'https://photos.example/photo-1.jpg');
    const useCase = new GetDaySummary(repository, targets, photoUrlResolver);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: 'entry-1',
          mealPhotoId: 'photo-1',
          name: 'Omelette',
          source: 'photo',
          photoUrl: 'https://cdn.example.com/meals/abc.jpg',
          portionGrams: 150,
          calories: 320,
          proteinG: 22,
          carbsG: 8,
          fatG: 21,
        },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.mealItems[0]?.photoUrl).toBe('https://photos.example/photo-1.jpg');
    expect(summary.mealItems[0]?.imageUrl).toBe('https://photos.example/photo-1.jpg');
    expect(summary.mealItems[0]?.entries[0]).toEqual(
      expect.objectContaining({
        id: 'entry-1',
        mealPhotoId: 'photo-1',
        photoUrl: 'https://photos.example/photo-1.jpg',
        imageUrl: 'https://photos.example/photo-1.jpg',
      }),
    );
    expect(photoUrlResolver).toHaveBeenCalledWith('user-1', 'photo-1');
  });

  it('resolves photoUrl from mealPhotoId for replaced meal-slot entries', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const photoUrlResolver = jest.fn(async (_userId: string, mealPhotoId: string) => `https://photos.example/${mealPhotoId}.jpg`);
    const useCase = new GetDaySummary(repository, targets, photoUrlResolver);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: 'entry-1',
          mealPhotoId: 'photo-1',
          name: 'Omelette',
          portionGrams: 150,
          calories: 320,
          proteinG: 22,
          carbsG: 8,
          fatG: 21,
        },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.mealItems[0]?.photoUrl).toBe('https://photos.example/photo-1.jpg');
    expect(summary.mealItems[0]?.imageUrl).toBe('https://photos.example/photo-1.jpg');
    expect(summary.mealItems[0]?.photoUrls).toEqual(['https://photos.example/photo-1.jpg']);
    expect(summary.mealItems[0]?.entries[0]?.photoUrl).toBe('https://photos.example/photo-1.jpg');
    expect(summary.mealItems[0]?.entries[0]?.imageUrl).toBe('https://photos.example/photo-1.jpg');
    expect(photoUrlResolver).toHaveBeenCalledWith('user-1', 'photo-1');
  });

  it('falls back to a UUID entry id when source metadata is missing', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const photoUrlResolver = jest.fn(async (_userId: string, mealPhotoId: string) => `https://photos.example/${mealPhotoId}.jpg`);
    const useCase = new GetDaySummary(repository, targets, photoUrlResolver);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: '57978c2c-f626-485e-b65b-4398bcae2b95',
          name: 'Omelette',
          portionGrams: 150,
          calories: 320,
          proteinG: 22,
          carbsG: 8,
          fatG: 21,
        },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.mealItems[0]?.photoUrl).toBe(
      'https://photos.example/57978c2c-f626-485e-b65b-4398bcae2b95.jpg',
    );
    expect(summary.mealItems[0]?.imageUrl).toBe(
      'https://photos.example/57978c2c-f626-485e-b65b-4398bcae2b95.jpg',
    );
    expect(summary.mealItems[0]?.entries[0]?.photoUrl).toBe(
      'https://photos.example/57978c2c-f626-485e-b65b-4398bcae2b95.jpg',
    );
    expect(summary.mealItems[0]?.entries[0]?.imageUrl).toBe(
      'https://photos.example/57978c2c-f626-485e-b65b-4398bcae2b95.jpg',
    );
    expect(summary.mealItems[0]?.entries[0]?.mealPhotoId).toBe('57978c2c-f626-485e-b65b-4398bcae2b95');
    expect(photoUrlResolver).toHaveBeenCalledWith('user-1', '57978c2c-f626-485e-b65b-4398bcae2b95');
  });

  it('returns undefined photoUrl when a photo-backed asset is missing', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    const photoUrlResolver = jest.fn(async () => null);
    const useCase = new GetDaySummary(repository, targets, photoUrlResolver);

    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: 'entry-1',
          mealPhotoId: 'photo-missing',
          name: 'Omelette',
          source: 'photo',
          photoUrl: 'https://stale.example/photo-missing.jpg',
          portionGrams: 150,
          calories: 320,
          proteinG: 22,
          carbsG: 8,
          fatG: 21,
        },
      ],
    });

    const summary = await useCase.execute({ userId: 'user-1', date: today });

    expect(summary.mealItems[0]?.photoUrl).toBeUndefined();
    expect(summary.mealItems[0]?.imageUrl).toBeUndefined();
    expect(summary.mealItems[0]?.photoUrls).toEqual([]);
    expect(summary.mealItems[0]?.entries[0]).toEqual(
      expect.objectContaining({
        mealPhotoId: 'photo-missing',
        photoUrl: undefined,
        imageUrl: undefined,
      }),
    );
  });

  it('recomputes totals from all meal items for the day', async () => {
    const repository = new InMemoryMealItemRepository();
    const targets = new FakeDailyTargetsPort();
    targets.setTargets('user-1', { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 });
    const useCase = new GetDaySummary(repository, targets, async (_userId, mealPhotoId) => `https://photos.example/${mealPhotoId}.jpg`);

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
    expect(summary.mealItems[0]?.photoUrls).toEqual([]);
  });
});
