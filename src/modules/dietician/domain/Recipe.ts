import { z } from 'zod';

export interface RecipeIngredient {
  name: string;
  amount: string;
}

export interface Recipe {
  title: string;
  subtitle?: string | null;
  timeMinutes: number;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** One line: why this fits the user's plan. */
  why?: string | null;
}

// `.nullish()` (not `.optional()`) on the soft fields so a client that always
// serializes the key — sending `subtitle: null` rather than omitting it — is
// accepted alongside the model's own omit-the-key output.
export const recipeSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullish(),
  timeMinutes: z.number(),
  servings: z.number(),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  fiberGrams: z.number().nullish(),
  ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
  steps: z.array(z.string()),
  why: z.string().nullish(),
});
