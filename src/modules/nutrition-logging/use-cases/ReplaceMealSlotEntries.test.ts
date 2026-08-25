import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { ReplaceMealSlotEntries } from './ReplaceMealSlotEntries';

const today = new Date('2026-08-23T00:00:00.000Z');

function buildEventPublisher() {
  return {
    publishLogged: jest.fn<Promise<void>, [unknown, unknown]>().mockResolvedValue(undefined),
    publishUpdated: jest.fn<Promise<void>, [unknown, unknown]>().mockResolvedValue(undefined),
  };
}

describe('ReplaceMealSlotEntries', () => {
  test('creates a new meal slot when no slot exists yet', async () => {
    const repository = new InMemoryMealItemRepository();
    const eventPublisher = buildEventPublisher();
    const useCase = new ReplaceMealSlotEntries(repository, eventPublisher, async (fn) => fn({} as never));

    const mealItem = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [{ id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 }],
    });

    expect(mealItem.entries).toHaveLength(1);
    expect(eventPublisher.publishLogged).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publishUpdated).not.toHaveBeenCalled();
  });

  test('replaces the full slot contents when the slot already exists', async () => {
    const repository = new InMemoryMealItemRepository();
    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [{ id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 }],
    });
    const eventPublisher = buildEventPublisher();
    const useCase = new ReplaceMealSlotEntries(repository, eventPublisher, async (fn) => fn({} as never));

    const mealItem = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-2', name: 'Oats', portionGrams: 80, calories: 300, proteinG: 10, carbsG: 52, fatG: 5 },
      ],
    });

    expect(mealItem.entries).toEqual([
      { id: 'entry-2', name: 'Oats', portionGrams: 80, calories: 300, proteinG: 10, carbsG: 52, fatG: 5 },
    ]);
    expect(eventPublisher.publishLogged).not.toHaveBeenCalled();
    expect(eventPublisher.publishUpdated).toHaveBeenCalledTimes(1);
  });

  test('keeps photo metadata when replacing a meal slot', async () => {
    const repository = new InMemoryMealItemRepository();
    const eventPublisher = buildEventPublisher();
    const useCase = new ReplaceMealSlotEntries(repository, eventPublisher, async (fn) => fn({} as never));

    const mealItem = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        {
          id: 'entry-2',
          mealPhotoId: 'photo-2',
          name: 'Oats',
          source: 'photo',
          photoUrl: 'https://cdn.example.com/meals/oats.jpg',
          portionGrams: 80,
          calories: 300,
          proteinG: 10,
          carbsG: 52,
          fatG: 5,
        },
      ],
    });

    expect(mealItem.entries).toEqual([
      {
        id: 'entry-2',
        mealPhotoId: 'photo-2',
        name: 'Oats',
        source: 'photo',
        photoUrl: 'https://cdn.example.com/meals/oats.jpg',
        portionGrams: 80,
        calories: 300,
        proteinG: 10,
        carbsG: 52,
        fatG: 5,
      },
    ]);
  });
});
