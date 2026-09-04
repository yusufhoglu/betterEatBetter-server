import { z } from 'zod';

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface Recipe {
  title: string;
  subtitle?: string;
  timeMinutes: number;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** One line: why this fits the user's plan. */
  why?: string;
}

export const recipeSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  timeMinutes: z.number(),
  servings: z.number(),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  fiberGrams: z.number().optional(),
  ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
  why: z.string().optional(),
});
