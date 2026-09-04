import { z } from 'zod';

export interface MealRating {
  mealName: string;
  /** 0-10, one decimal. Mobile: >=7 green, >=4 amber, else red. */
  score: number;
  macros: {
    totalCalories: number;
    totalProteinGrams: number;
    totalCarbsGrams: number;
    totalFatGrams: number;
  };
  /** The macro to flag as disproportionately high, if any. */
  flaggedMacro: 'protein' | 'carbs' | 'fat' | null;
  goodNote: string;
  fixNote: string;
}

export const mealRatingSchema = z.object({
  mealName: z.string(),
  score: z.number().min(0).max(10),
  macros: z.object({
    totalCalories: z.number(),
    totalProteinGrams: z.number(),
    totalCarbsGrams: z.number(),
    totalFatGrams: z.number(),
  }),
  flaggedMacro: z.enum(['protein', 'carbs', 'fat']).nullable(),
  goodNote: z.string(),
  fixNote: z.string(),
});
