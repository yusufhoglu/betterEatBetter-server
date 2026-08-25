import { z } from 'zod';

export const persistedPhotoUrlSchema = z
  .string()
  .optional()
  .nullable()
  .transform<string | undefined>((value) => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return undefined;
    }
  });

export const loggedMealEntrySchema = z.object({
  id: z.string().min(1),
  mealPhotoId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  source: z.string().min(1).max(50).optional(),
  photoUrl: persistedPhotoUrlSchema,
  imageUrl: persistedPhotoUrlSchema,
  portionGrams: z.number().positive(),
  calories: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});
