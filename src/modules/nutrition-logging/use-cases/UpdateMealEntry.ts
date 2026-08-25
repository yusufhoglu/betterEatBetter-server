import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { withTransaction, type TransactionClient } from '../../../shared/persistence/transaction';
import type { LoggedMealEntry, MealItem, MealType } from '../domain/MealItem';
import { loggedMealEntrySchema } from '../domain/loggedMealEntrySchema';
import { mealTypes } from '../domain/MealItem';
import { toMealEventEntries, type MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

const updateMealEntrySchema = z.object({
  userId: z.string().min(1),
  date: z.date(),
  mealType: z.enum(mealTypes),
  entryId: z.string().min(1),
  entry: loggedMealEntrySchema.extend({
    portionGrams: z.number().positive().max(5000),
    calories: z.number().min(0).max(5000),
    proteinG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(1000),
    fatG: z.number().min(0).max(500),
  }),
});

export interface UpdateMealEntryInput {
  userId: string;
  date: Date;
  mealType: MealType;
  entryId: string;
  entry: LoggedMealEntry;
}

type TransactionRunner = <T>(fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;

function parseOrThrow(input: UpdateMealEntryInput): UpdateMealEntryInput {
  const parsed = updateMealEntrySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_MEAL_ENTRY', parsed.error.issues[0]?.message ?? 'Invalid meal entry payload');
  }

  return parsed.data;
}

function serializeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class UpdateMealEntry {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly eventPublisher: Pick<MealLoggedEventPublisher, 'publishUpdated'>,
    private readonly runInTransaction: TransactionRunner = withTransaction,
  ) {}

  async execute(input: UpdateMealEntryInput): Promise<MealItem> {
    const validInput = parseOrThrow(input);

    return this.runInTransaction(async (tx) => {
      const mealItem = await this.repository.findByUserIdDateAndMealType(
        validInput.userId,
        validInput.date,
        validInput.mealType,
      );

      if (!mealItem) {
        throw new NotFoundError('MEAL_ITEM_NOT_FOUND', 'Meal item was not found');
      }

      const updatedEntries = mealItem.entries.map((entry) =>
        entry.id === validInput.entryId ? { ...validInput.entry, id: validInput.entryId } : entry,
      );

      if (!updatedEntries.some((entry) => entry.id === validInput.entryId)) {
        throw new NotFoundError('MEAL_ENTRY_NOT_FOUND', 'Meal entry was not found');
      }

      const updatedMealItem = await this.repository.replaceEntries(
        {
          mealItemId: mealItem.id,
          userId: mealItem.userId,
          date: mealItem.date,
          mealType: mealItem.mealType,
          entries: updatedEntries,
        },
        tx,
      );

      await this.eventPublisher.publishUpdated(tx, {
        userId: updatedMealItem.userId,
        date: serializeDate(updatedMealItem.date),
        mealType: updatedMealItem.mealType,
        mealItemId: updatedMealItem.id,
        entries: toMealEventEntries(updatedMealItem.entries),
      });

      return updatedMealItem;
    });
  }
}
