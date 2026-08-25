import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { withTransaction, type TransactionClient } from '../../../shared/persistence/transaction';
import type { LoggedMealEntry, MealItem, MealType } from '../domain/MealItem';
import { loggedMealEntrySchema } from '../domain/loggedMealEntrySchema';
import { mealTypes } from '../domain/MealItem';
import { toMealEventEntries, type MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

const logMealEntriesSchema = z.object({
  userId: z.string().min(1),
  date: z.date(),
  mealType: z.enum(mealTypes),
  entries: z
    .array(
      loggedMealEntrySchema.extend({
        portionGrams: z.number().positive().max(5000),
        calories: z.number().min(0).max(5000),
        proteinG: z.number().min(0).max(500),
        carbsG: z.number().min(0).max(1000),
        fatG: z.number().min(0).max(500),
      }),
    )
    .min(1),
});

export interface LogMealEntriesInput {
  userId: string;
  date: Date;
  mealType: MealType;
  entries: LoggedMealEntry[];
}

type TransactionRunner = <T>(fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;

function parseOrThrow(input: LogMealEntriesInput): LogMealEntriesInput {
  const parsed = logMealEntriesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_MEAL_ENTRY', parsed.error.issues[0]?.message ?? 'Invalid meal entry payload');
  }

  return parsed.data;
}

function serializeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export class LogMealEntries {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly eventPublisher: Pick<MealLoggedEventPublisher, 'publishLogged'>,
    private readonly runInTransaction: TransactionRunner = withTransaction,
  ) {}

  async execute(input: LogMealEntriesInput): Promise<MealItem> {
    const validInput = parseOrThrow(input);

    return this.runInTransaction(async (tx) => {
      const mealItem = await this.repository.appendEntries(validInput, tx);
      await this.eventPublisher.publishLogged(tx, {
        userId: mealItem.userId,
        date: serializeDate(mealItem.date),
        mealType: mealItem.mealType,
        mealItemId: mealItem.id,
        entries: toMealEventEntries(mealItem.entries),
      });
      return mealItem;
    });
  }
}
