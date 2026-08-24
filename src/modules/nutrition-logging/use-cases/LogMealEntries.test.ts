import type { TransactionClient } from '../../../shared/persistence/transaction';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { InMemoryMealItemRepository } from '../test-utils/fakes/InMemoryMealItemRepository';
import { LogMealEntries } from './LogMealEntries';

const today = new Date('2026-08-23T00:00:00.000Z');
const tx = { label: 'test-transaction' } as unknown as TransactionClient;
const runInTransaction = async <T>(fn: (innerTx: TransactionClient) => Promise<T>): Promise<T> => fn(tx);

describe('LogMealEntries', () => {
  it('creates a new meal item on the first call', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishLogged: jest.fn().mockResolvedValue(undefined) };
    const useCase = new LogMealEntries(repository, publisher, runInTransaction);

    const created = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });

    expect(created.mealType).toBe('breakfast');
    expect(created.entries).toHaveLength(1);
    expect(repository.findAll()).toHaveLength(1);
    expect(publisher.publishLogged).toHaveBeenCalledTimes(1);
    expect(publisher.publishLogged).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: 'user-1',
        date: '2026-08-23',
        mealType: 'breakfast',
        mealItemId: created.id,
        entries: [
          {
            name: 'Eggs',
            source: 'manual',
            portionGrams: 120,
            calories: 180,
            proteinG: 14,
            carbsG: 2,
            fatG: 12,
          },
        ],
      }),
    );
  });

  it('appends entries to the existing meal item for the same user/date/mealType', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishLogged: jest.fn().mockResolvedValue(undefined) };
    const useCase = new LogMealEntries(repository, publisher, runInTransaction);

    const first = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });
    const second = await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-2', name: 'Toast', portionGrams: 60, calories: 160, proteinG: 5, carbsG: 28, fatG: 2 },
      ],
    });

    expect(second.id).toBe(first.id);
    expect(second.entries).toHaveLength(2);
    expect(repository.findAll()).toHaveLength(1);
  });

  it('rejects out-of-range values with ValidationError', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishLogged: jest.fn().mockResolvedValue(undefined) };
    const useCase = new LogMealEntries(repository, publisher, runInTransaction);

    await expect(
      useCase.execute({
        userId: 'user-1',
        date: today,
        mealType: 'breakfast',
        entries: [
          { id: 'entry-1', name: 'Bad data', portionGrams: 100, calories: -5, proteinG: 10, carbsG: 1, fatG: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('writes the meal item and outbox event inside the same transaction', async () => {
    const events: string[] = [];
    const sharedTx = { label: 'shared-tx' } as unknown as TransactionClient;

    class ObservableRepository extends InMemoryMealItemRepository {
      override async appendEntries(input: Parameters<InMemoryMealItemRepository['appendEntries']>[0], innerTx?: TransactionClient) {
        events.push(`repo:${innerTx === sharedTx}`);
        return super.appendEntries(input, innerTx);
      }
    }

    const repository = new ObservableRepository();
    const publisher = {
      publishLogged: jest.fn(async (innerTx: TransactionClient) => {
        events.push(`publisher:${innerTx === sharedTx}`);
      }),
    };
    const runInTransaction = async <T>(fn: (innerTx: TransactionClient) => Promise<T>): Promise<T> => {
      events.push('tx:start');
      const result = await fn(sharedTx);
      events.push('tx:end');
      return result;
    };

    const useCase = new LogMealEntries(repository, publisher, runInTransaction);
    await useCase.execute({
      userId: 'user-1',
      date: today,
      mealType: 'breakfast',
      entries: [
        { id: 'entry-1', name: 'Eggs', portionGrams: 120, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
      ],
    });

    expect(events).toEqual(['tx:start', 'repo:true', 'publisher:true', 'tx:end']);
  });

  it('publishes the stored meal entries inside the outbox payload', async () => {
    const repository = new InMemoryMealItemRepository();
    const publisher = { publishLogged: jest.fn().mockResolvedValue(undefined) };
    const useCase = new LogMealEntries(repository, publisher, runInTransaction);

    await useCase.execute({
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

    expect(publisher.publishLogged).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        entries: [
          {
            name: 'Eggs',
            source: 'photo',
            portionGrams: 120,
            calories: 180,
            proteinG: 14,
            carbsG: 2,
            fatG: 12,
          },
        ],
      }),
    );
  });
});
