import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { withTransaction, type TransactionClient } from '../../../shared/persistence/transaction';
import type { LoggedMealEntry, MealItem, MealType } from '../domain/MealItem';
import { loggedMealEntrySchema } from '../domain/loggedMealEntrySchema';
import { mealTypes } from '../domain/MealItem';
import { toMealEventEntries, type MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

const replaceMealSlotEntriesSchema = z.object({
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

export interface ReplaceMealSlotEntriesInput {
  userId: string;
  date: Date;
  mealType: MealType;
  entries: LoggedMealEntry[];
}

type TransactionRunner = <T>(fn: (tx: TransactionClient) => Promise<T>) => Promise<T>;

function serializeDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseOrThrow(input: ReplaceMealSlotEntriesInput): ReplaceMealSlotEntriesInput {
  const parsed = replaceMealSlotEntriesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_MEAL_ENTRY', parsed.error.issues[0]?.message ?? 'Invalid meal entry payload');
  }

  return parsed.data;
}

export class ReplaceMealSlotEntries {
  constructor(
    private readonly repository: MealItemRepositoryPort,
    private readonly eventPublisher: Pick<MealLoggedEventPublisher, 'publishLogged' | 'publishUpdated'>,
    private readonly runInTransaction: TransactionRunner = withTransaction,
  ) {}

  async execute(input: ReplaceMealSlotEntriesInput): Promise<MealItem> {
    const validInput = parseOrThrow(input);

    return this.runInTransaction(async (tx) => {
      const existing = await this.repository.findByUserIdDateAndMealType(
        validInput.userId,
        validInput.date,
        validInput.mealType,
      );

      if (!existing) {
        const created = await this.repository.appendEntries(validInput, tx);
        await this.eventPublisher.publishLogged(tx, {
          userId: created.userId,
          date: serializeDate(created.date),
          mealType: created.mealType,
          mealItemId: created.id,
          entries: toMealEventEntries(created.entries),
        });
        return created;
      }

      const replaced = await this.repository.replaceEntries(
        {
          mealItemId: existing.id,
          userId: validInput.userId,
          date: validInput.date,
          mealType: validInput.mealType,
          entries: validInput.entries,
        },
        tx,
      );
      await this.eventPublisher.publishUpdated(tx, {
        userId: replaced.userId,
        date: serializeDate(replaced.date),
        mealType: replaced.mealType,
        mealItemId: replaced.id,
        entries: toMealEventEntries(replaced.entries),
      });
      return replaced;
    });
  }
}
