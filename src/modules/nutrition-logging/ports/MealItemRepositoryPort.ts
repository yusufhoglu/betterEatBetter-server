import type { TransactionClient } from '../../../shared/persistence/transaction';
import type { LoggedMealEntry, MealItem, MealType } from '../domain/MealItem';

export interface AppendMealEntriesInput {
  userId: string;
  date: Date;
  mealType: MealType;
  entries: LoggedMealEntry[];
}

export interface ReplaceMealEntriesInput extends AppendMealEntriesInput {
  mealItemId: string;
}

export interface MealItemRepositoryPort {
  appendEntries(input: AppendMealEntriesInput, tx?: TransactionClient): Promise<MealItem>;
  replaceEntries(input: ReplaceMealEntriesInput, tx?: TransactionClient): Promise<MealItem>;
  findByUserIdAndDate(userId: string, date: Date): Promise<MealItem[]>;
  /** Most-recent-first meal slots across all dates (for the "My Meals" history). */
  findRecentByUserId(userId: string, limit: number): Promise<MealItem[]>;
  findByUserIdDateAndMealType(userId: string, date: Date, mealType: MealType): Promise<MealItem | null>;
  findMealTypesInRange(userId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; mealType: string }>>;
  deleteById(mealItemId: string, tx?: TransactionClient): Promise<void>;
}
