import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { withTransaction, type TransactionClient } from '../../../shared/persistence/transaction';
import type { MealItem, MealType } from '../domain/MealItem';
import type { MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

export interface DeleteMealEntryInput {
  userId: string;
  date: Date;
  mealType: MealType;
  entryId: string;
}

type TransactionRunner = <T>(fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;

function serializeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class DeleteMealEntry {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly eventPublisher: Pick<MealLoggedEventPublisher, 'publishDeleted'>,
    private readonly runInTransaction: TransactionRunner = withTransaction,
  ) {}

  async execute(input: DeleteMealEntryInput): Promise<MealItem | null> {
    return this.runInTransaction(async (tx) => {
      const mealItem = await this.repository.findByUserIdDateAndMealType(input.userId, input.date, input.mealType);
      if (!mealItem) {
        throw new NotFoundError('MEAL_ITEM_NOT_FOUND', 'Meal item was not found');
      }

      const remainingEntries = mealItem.entries.filter((entry) => entry.id !== input.entryId);
      if (remainingEntries.length === mealItem.entries.length) {
        throw new NotFoundError('MEAL_ENTRY_NOT_FOUND', 'Meal entry was not found');
      }

      let updatedMealItem: MealItem | null = null;
      if (remainingEntries.length === 0) {
        await this.repository.deleteById(mealItem.id, tx);
      } else {
        updatedMealItem = await this.repository.replaceEntries(
          {
            mealItemId: mealItem.id,
            userId: mealItem.userId,
            date: mealItem.date,
            mealType: mealItem.mealType,
            entries: remainingEntries,
          },
          tx,
        );
      }

      await this.eventPublisher.publishDeleted(tx, {
        userId: mealItem.userId,
        date: serializeDate(mealItem.date),
        mealType: mealItem.mealType,
        mealItemId: mealItem.id,
      });

      return updatedMealItem;
    });
  }
}
