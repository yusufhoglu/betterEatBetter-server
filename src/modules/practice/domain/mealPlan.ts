import { z } from 'zod';

/** Default meal names the web panel offers; the stored `name` is free text. */
export const DEFAULT_MEAL_NAMES = ['Sabah', 'Ara öğün', 'Öğle', 'İkindi', 'Akşam', 'Gece'] as const;

const nutrient = z.number().min(0).max(100000).nullable();
const text = (max: number) => z.string().trim().max(max);

export const mealPlanItemSchema = z.object({
  /** Stable id inside the plan, assigned by the editor. */
  id: z.string().min(1).max(64),
  name: text(200).min(1),
  amount: z.number().min(0).max(100000).nullable(),
  unit: text(30),
  /** Totals for `amount` `unit` — not per 100 g. */
  calories: nutrient,
  proteinG: nutrient,
  carbsG: nutrient,
  fatG: nutrient,
  note: text(300).nullable(),
});

export const mealPlanMealSchema = z.object({
  id: z.string().min(1).max(64),
  name: text(60).min(1),
  /** 24h "HH:MM". */
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  note: text(500).nullable(),
  items: z.array(mealPlanItemSchema).max(60),
});

export const mealPlanInputSchema = z.object({
  title: text(120).nullable(),
  notes: text(3000).nullable(),
  meals: z.array(mealPlanMealSchema).max(12),
});

export type MealPlanItem = z.infer<typeof mealPlanItemSchema>;
export type MealPlanMeal = z.infer<typeof mealPlanMealSchema>;
export type MealPlanInput = z.infer<typeof mealPlanInputSchema>;

export interface MealPlan extends MealPlanInput {
  id: string;
  linkId: string;
  dietitianId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Letterhead for the printed plan. All optional — the panel falls back to the dietitian's profile. */
export const planHeaderSchema = z.object({
  clinicName: text(100).nullable(),
  tagline: text(150).nullable(),
  contact: text(200).nullable(),
  footer: text(300).nullable(),
});
export type PlanHeader = z.infer<typeof planHeaderSchema>;

export const EMPTY_PLAN_HEADER: PlanHeader = { clinicName: null, tagline: null, contact: null, footer: null };

export const customFoodInputSchema = z.object({
  name: text(120).min(1),
  amount: z.number().positive().max(100000),
  unit: text(30).min(1),
  calories: z.number().min(0).max(100000),
  proteinG: z.number().min(0).max(100000),
  carbsG: z.number().min(0).max(100000),
  fatG: z.number().min(0).max(100000),
});
export type CustomFoodInput = z.infer<typeof customFoodInputSchema>;

export interface CustomFood extends CustomFoodInput {
  id: string;
  dietitianId: string;
}

/** A search hit; nutrition is for `amount` `unit`. */
export interface FoodOption {
  source: 'custom' | 'catalog';
  id: string;
  name: string;
  brand: string | null;
  amount: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}
