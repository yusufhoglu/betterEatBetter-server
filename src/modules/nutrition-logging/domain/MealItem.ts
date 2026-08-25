export const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealType = (typeof mealTypes)[number];

export interface LoggedMealEntry {
  id: string;
  mealPhotoId?: string;
  name: string;
  source?: string;
  photoUrl?: string;
  imageUrl?: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealItem {
  id: string;
  userId: string;
  date: Date;
  mealType: MealType;
  entries: LoggedMealEntry[];
  createdAt: Date;
  updatedAt: Date;
}
