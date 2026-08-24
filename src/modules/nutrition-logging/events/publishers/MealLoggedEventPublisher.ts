import type { Prisma } from '@prisma/client';
import type { TransactionClient } from '../../../../shared/persistence/transaction';
import { publishEvent } from '../../../../shared/persistence/outbox';
import type { LoggedMealEntry, MealType } from '../../domain/MealItem';

export interface MealEventEntry extends Prisma.InputJsonObject {
  name: string;
  source: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealEventPayload extends Prisma.InputJsonObject {
  userId: string;
  date: string;
  mealType: MealType;
  mealItemId: string;
  entries: MealEventEntry[];
}

/**
 * body-analytics consumes these outbox events without reading nutrition-logging
 * synchronously, so the event payload must carry the full meal entry snapshot.
 */
export function toMealEventEntries(entries: LoggedMealEntry[]): MealEventEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    source: entry.source ?? 'manual',
    portionGrams: entry.portionGrams,
    calories: entry.calories,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
  }));
}

export class MealLoggedEventPublisher {
  publishLogged(tx: TransactionClient, payload: MealEventPayload): Promise<void> {
    return publishEvent(tx, 'meal.logged', payload);
  }

  publishUpdated(tx: TransactionClient, payload: MealEventPayload): Promise<void> {
    return publishEvent(tx, 'meal.updated', payload);
  }

  publishDeleted(tx: TransactionClient, payload: MealEventPayload): Promise<void> {
    return publishEvent(tx, 'meal.deleted', payload);
  }
}
