import type { MealLogEntry, MealLogReadModel, MealSlot } from '../domain/bodyAnalyticsTypes';

export interface UpsertMealLogInput {
  userId: string;
  date: Date;
  mealType: MealSlot;
  entries: MealLogEntry[];
}

export interface DeleteMealLogInput {
  userId: string;
  date: Date;
  mealType: MealSlot;
}

export interface MealLogReadModelPort {
  upsert(input: UpsertMealLogInput): Promise<MealLogReadModel>;
  delete(input: DeleteMealLogInput): Promise<void>;
  listForRange(userId: string, startDate: Date | null, endDate: Date): Promise<MealLogReadModel[]>;
}
