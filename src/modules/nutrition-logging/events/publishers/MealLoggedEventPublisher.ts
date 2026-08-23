import type { TransactionClient } from '../../../../shared/persistence/transaction';
import { publishEvent } from '../../../../shared/persistence/outbox';
import type { MealType } from '../../domain/MealItem';

export interface MealEventPayload extends Record<string, string> {
  userId: string;
  date: string;
  mealType: MealType;
  mealItemId: string;
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
