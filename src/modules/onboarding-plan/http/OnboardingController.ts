import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { CompleteOnboarding } from '../use-cases/CompleteOnboarding';

const completeOnboardingSchema = z.object({
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  age: z.number().int().positive(),
  gender: z.enum(['male', 'female']),
  workoutsPerWeek: z.number().int().min(0),
  goal: z.enum(['lose', 'maintain', 'gain']),
  weeklyPaceKg: z.number(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}

export class OnboardingController {
  constructor(private readonly completeOnboarding: CompleteOnboarding) {}

  handleComplete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth!.userId;
      const input = parseOrThrow(completeOnboardingSchema, req.body);
      const plan = await this.completeOnboarding.execute({ userId, ...input });
      res.status(201).json(plan);
    } catch (err) {
      next(err);
    }
  };
}
