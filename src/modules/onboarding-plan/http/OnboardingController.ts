import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { CompleteOnboarding } from '../use-cases/CompleteOnboarding';

const logger = createModuleLogger('onboarding-controller');

const dateOfBirthSchema = z.string().datetime({ offset: true }).or(z.string().date());

const completeOnboardingSchema = z
  .object({
    weightKg: z.number().positive(),
    targetWeightKg: z.number().positive().optional(),
    heightCm: z.number().positive(),
    age: z.number().int().positive().optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    gender: z.enum(['male', 'female']),
    workoutsPerWeek: z.number().int().min(0),
    goal: z.enum(['lose', 'maintain', 'gain']),
    weeklyPaceKg: z.number().positive(),
  })
  .refine((value) => value.age !== undefined || value.dateOfBirth !== undefined, {
    message: 'Either age or dateOfBirth is required',
  });

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}

function computeAgeFromDateOfBirth(dateOfBirth: string, now: Date = new Date()): number {
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    throw new ValidationError('INVALID_REQUEST_BODY', 'dateOfBirth must be a valid ISO-8601 date');
  }

  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const birthMonth = birthDate.getUTCMonth();

  if (nowMonth < birthMonth || (nowMonth === birthMonth && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  if (age <= 0) {
    throw new ValidationError('INVALID_REQUEST_BODY', 'dateOfBirth must be in the past');
  }

  return age;
}

export class OnboardingController {
  constructor(private readonly completeOnboarding: CompleteOnboarding) {}

  handleComplete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.auth!.userId;
      logger.info({ userId, bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>) }, 'onboarding complete request received');
      const input = parseOrThrow(completeOnboardingSchema, req.body);
      const age = input.age ?? computeAgeFromDateOfBirth(input.dateOfBirth!);
      const plan = await this.completeOnboarding.execute({
        userId,
        weightKg: input.weightKg,
        targetWeightKg: input.targetWeightKg,
        heightCm: input.heightCm,
        age,
        gender: input.gender,
        workoutsPerWeek: input.workoutsPerWeek,
        goal: input.goal,
        weeklyPaceKg: input.weeklyPaceKg,
      });
      logger.info({ userId, dailyCalories: plan.dailyCalories }, 'onboarding complete request succeeded');
      res.status(201).json(plan);
    } catch (err) {
      logger.error({ err }, 'onboarding complete request failed');
      next(err);
    }
  };
}
