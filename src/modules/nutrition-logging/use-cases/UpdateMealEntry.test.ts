import type { TransactionClient } from '../../../shared/persistence/transaction';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { UpdateMealEntry } from './UpdateMealEntry';

const today = new Date('2026-08-23T00:00:00.000Z');
const tx = { label: 'test-transaction' } as unknown as TransactionClient;
const runInTransaction = async <T>(fn: (innerTx: TransactionClient) => Promise<T>): Promise<T> => fn(tx);

describe('UpdateMealEntry', () => {
  it('updates a single entry and publishes an event', async () => {
    const repository = new InMemoryMealItemRepository();
    await repository.appendEntries({
      userId: 'user-1',
      date: today,
      mealType: 'lunch',
      entries: [
        { id: 'entry-1', name: 'Chicken', portionGrams: 180, calories: 300, proteinG: 40, carbsG: 0, fatG: 10 },
      ],
    });
    const publisher = { publishUpdated: jest.fn().mockResolvedValue(undefined) };
    const useCase = new UpdateMealEntry(repository, publisher, runInTransaction);

    const updated = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'lunch',
      entryId: 'entry-1',
      entry: { id: 'another-id', name: 'Chicken Bowl', portionGrams: 220, calories: 360, proteinG: 44, carbsG: 8, fatG: 12 },
    });

    expect(updated.entries).toEqual([
      { id: 'entry-1', name: 'Chicken Bowl', portionGrams: 220, calories: 360, proteinG: 44, carbsG: 8, fatG: 12 },
    ]);
    expect(publisher.publishUpdated).toHaveBeenCalledTimes(1);
    expect(publisher.publishUpdated).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: 'user-1',
        date: '2026-08-23',
        mealType: 'lunch',
        mealItemId: updated.id,
        entries: [
          {
            name: 'Chicken Bowl',
            source: 'manual',
            portionGrams: 220,
            calories: 360,
            proteinG: 44,
            carbsG: 8,
            fatG: 12,
          },
        ],
      }),
    );
  });

  it('throws NotFoundError when the entry does not exist', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishUpdated: jest.fn().mockResolvedValue(undefined) };
    const useCase = new UpdateMealEntry(repository, publisher, runInTransaction);

    await expect(
      useCase.execute({
        userId: 'user-1',
        date: today,
        mealType: 'lunch',
        entryId: 'missing',
        entry: { id: 'missing', name: 'Chicken Bowl', portionGrams: 220, calories: 360, proteinG: 44, carbsG: 8, fatG: 12 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
