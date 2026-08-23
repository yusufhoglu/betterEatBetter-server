import type { TransactionClient } from '../../../shared/persistence/transaction';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { DeleteMealEntry } from './DeleteMealEntry';

const today = new Date('2026-08-23T00:00:00.000Z');
const tx = { label: 'test-transaction' } as unknown as TransactionClient;
const runInTransaction = async <T>(fn: (innerTx: TransactionClient) => Promise<T>): Promise<T> => fn(tx);

describe('DeleteMealEntry', () => {
  it('removes one entry and keeps the meal item when others remain', async () => {
    const repository = new InMemoryMealItemRepository();
    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'dinner',
      entries: [
        { id: 'entry-1', name: 'Chicken', portionGrams: 180, calories: 300, proteinG: 40, carbsG: 0, fatG: 10 },
        { id: 'entry-2', name: 'Rice', portionGrams: 180, calories: 240, proteinG: 4, carbsG: 52, fatG: 1 },
      ],
    });
    const publisher = { publishDeleted: jest.fn().mockResolvedValue(undefined) };
    const useCase = new DeleteMealEntry(repository, publisher, runInTransaction);

    const updated = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'dinner',
      entryId: 'entry-1',
    });

    expect(updated?.entries).toEqual([
      { id: 'entry-2', name: 'Rice', portionGrams: 180, calories: 240, proteinG: 4, carbsG: 52, fatG: 1 },
    ]);
    expect(repository.findAll()).toHaveLength(1);
    expect(publisher.publishDeleted).toHaveBeenCalledTimes(1);
  });

  it('deletes the meal item when the last entry is removed', async () => {
    const repository = new InMemoryMealItemRepository();
    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'snack',
      entries: [
        { id: 'entry-1', name: 'Yogurt', portionGrams: 120, calories: 110, proteinG: 8, carbsG: 10, fatG: 3 },
      ],
    });
    const publisher = { publishDeleted: jest.fn().mockResolvedValue(undefined) };
    const useCase = new DeleteMealEntry(repository, publisher, runInTransaction);

    const updated = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'snack',
      entryId: 'entry-1',
    });

    expect(updated).toBeNull();
    expect(repository.findAll()).toHaveLength(0);
  });

  it('throws NotFoundError when the entry is missing', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishDeleted: jest.fn().mockResolvedValue(undefined) };
    const useCase = new DeleteMealEntry(repository, publisher, runInTransaction);

    await expect(
      useCase.execute({
        userId: 'user-1',
        date: today,
        mealType: 'snack',
        entryId: 'missing',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
