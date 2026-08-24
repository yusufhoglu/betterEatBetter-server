import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { computePlan } from '../../../shared/domain/PlanCalculationService';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { ComputeWeightProjection } from '../../onboarding-plan/domain/ComputeWeightProjection';
import type { GetUserAccountProfile } from '../../identity/use-cases/GetUserAccountProfile';
import type { UpdateUserAccountProfile } from '../../identity/use-cases/UpdateUserAccountProfile';
import type { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import type { GetActivePlan } from '../../onboarding-plan/use-cases/GetActivePlan';
import type { UpdatePlan } from '../../onboarding-plan/use-cases/UpdatePlan';
import type { UpdateProfileMeasurements } from '../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import type { GetSubscriptionEntitlement } from '../../subscription/use-cases/GetSubscriptionEntitlement';
import type { MeCatalogRepositoryPort } from '../ports/MeCatalogRepositoryPort';
import type { MePreferencesRepositoryPort, NotificationPreferencesPatch } from '../ports/MePreferencesRepositoryPort';

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    bio: z.string().trim().max(280).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    heightCm: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
    age: z.number().int().positive().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one profile field must be provided',
  });

const goalPatchSchema = z
  .object({
    goalLabel: z.enum(['Lose Weight', 'Maintain Weight', 'Gain Weight']).optional(),
    targetWeightKg: z.number().positive().nullable().optional(),
    weeklyPaceKg: z.number().positive().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one goal field must be provided',
  });

const notificationPreferencesSchema = z
  .object({
    masterEnabled: z.boolean().optional(),
    breakfast: z
      .object({
        enabled: z.boolean().optional(),
        time: timeSchema.optional(),
      })
      .optional(),
    lunch: z
      .object({
        enabled: z.boolean().optional(),
        time: timeSchema.optional(),
      })
      .optional(),
    dinner: z
      .object({
        enabled: z.boolean().optional(),
        time: timeSchema.optional(),
      })
      .optional(),
    waterReminders: z.boolean().optional(),
    streakSaver: z.boolean().optional(),
    weeklyReport: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one notification preference field must be provided',
  });

const unitPreferencesSchema = z
  .object({
    weightUnit: z.enum(['kg', 'lbs']).optional(),
    heightUnit: z.enum(['cm', 'ft/in']).optional(),
    energyUnit: z.enum(['kcal', 'kJ']).optional(),
    waterUnit: z.enum(['ml', 'fl oz']).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one unit preference field must be provided',
  });

const favoriteRecipeSchema = z.object({
  title: z.string().trim().min(1),
  imageUrl: z.string().url().nullable().optional(),
  emoji: z.string().trim().min(1).nullable().optional(),
  kcal: z.number().int().positive(),
  prepTimeMinutes: z.number().int().positive(),
});

const myMealCreateSchema = z.object({
  title: z.string().trim().min(1),
  imageUrl: z.string().url().nullable().optional(),
  emoji: z.string().trim().min(1).nullable().optional(),
  kcal: z.number().int().positive(),
  proteinG: z.number().int().nonnegative(),
});

const myMealUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    imageUrl: z.string().url().nullable().optional(),
    emoji: z.string().trim().min(1).nullable().optional(),
    kcal: z.number().int().positive().optional(),
    proteinG: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one saved meal field must be provided',
  });

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(code, parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  return parsed.data;
}

function toGoalLabel(goal: 'lose' | 'maintain' | 'gain'): 'Lose Weight' | 'Maintain Weight' | 'Gain Weight' {
  if (goal === 'lose') {
    return 'Lose Weight';
  }
  if (goal === 'gain') {
    return 'Gain Weight';
  }
  return 'Maintain Weight';
}

function fromGoalLabel(goalLabel: 'Lose Weight' | 'Maintain Weight' | 'Gain Weight'): 'lose' | 'maintain' | 'gain' {
  if (goalLabel === 'Lose Weight') {
    return 'lose';
  }
  if (goalLabel === 'Gain Weight') {
    return 'gain';
  }
  return 'maintain';
}

export class MeController {
  constructor(
    private readonly getUserAccountProfile: GetUserAccountProfile,
    private readonly updateUserAccountProfile: UpdateUserAccountProfile,
    private readonly getUserProfile: GetUserProfile,
    private readonly getActivePlan: GetActivePlan,
    private readonly updatePlan: UpdatePlan,
    private readonly updateProfileMeasurements: UpdateProfileMeasurements,
    private readonly getSubscriptionEntitlement: GetSubscriptionEntitlement,
    private readonly catalogRepository: MeCatalogRepositoryPort,
    private readonly preferencesRepository: MePreferencesRepositoryPort,
  ) {}

  private async buildProfileResponse(userId: string) {
    const [account, profile, isPremium] = await Promise.all([
      this.getUserAccountProfile.execute(userId),
      this.getUserProfile.execute(userId),
      this.getSubscriptionEntitlement.execute(userId),
    ]);

    if (!account || !profile) {
      throw new ValidationError('PROFILE_NOT_READY', 'User profile is not available');
    }

    const fallbackHandle = account.email.split('@')[0] ?? 'user';

    return {
      id: account.id,
      name: account.name ?? account.username ?? fallbackHandle,
      username: account.username ?? fallbackHandle,
      bio: account.bio,
      avatarUrl: account.avatarUrl,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      age: profile.age,
      isPremium,
    };
  }

  private async buildGoalResponse(userId: string) {
    const [profile, plan] = await Promise.all([
      this.getUserProfile.execute(userId),
      this.getActivePlan.execute(userId),
    ]);

    if (!profile || !plan) {
      throw new ValidationError('GOAL_NOT_READY', 'User goal is not available');
    }

    const projection = ComputeWeightProjection({
      startWeightKg: profile.weightKg,
      targetWeightKg: profile.targetWeightKg,
      goal: profile.goal,
      weeklyPaceKg: profile.weeklyPaceKg,
    });

    const weeksToGoal =
      projection.estimatedTargetDate === null
        ? null
        : Math.ceil(
            (projection.estimatedTargetDate.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000),
          );

    return {
      goalLabel: toGoalLabel(profile.goal),
      targetWeightKg: profile.targetWeightKg,
      weeklyPaceKg: profile.weeklyPaceKg,
      dailyCalories: Math.round(plan.dailyCalories),
      weeksToGoal: weeksToGoal === null ? null : Math.max(weeksToGoal, 0),
    };
  }

  handleGetProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.buildProfileResponse(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePatchProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(profilePatchSchema, req.body, 'INVALID_PROFILE_UPDATE');
      const userId = req.auth!.userId;

      if (
        input.name !== undefined ||
        input.username !== undefined ||
        input.bio !== undefined ||
        input.avatarUrl !== undefined
      ) {
        await this.updateUserAccountProfile.execute(userId, {
          name: input.name,
          username: input.username,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
        });
      }

      if (input.heightCm !== undefined || input.age !== undefined) {
        await this.updateProfileMeasurements.execute(userId, {
          heightCm: input.heightCm,
          age: input.age,
        });
      }

      if (input.weightKg !== undefined) {
        await this.updatePlan.execute(userId, { weightKg: input.weightKg });
      }

      res.status(200).json(await this.buildProfileResponse(userId));
    } catch (error) {
      next(error);
    }
  };

  handleGetGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.buildGoalResponse(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePatchGoal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(goalPatchSchema, req.body, 'INVALID_GOAL_UPDATE');
      await this.updatePlan.execute(req.auth!.userId, {
        goal: input.goalLabel ? fromGoalLabel(input.goalLabel) : undefined,
        targetWeightKg: input.targetWeightKg === undefined ? undefined : input.targetWeightKg,
        weeklyPaceKg: input.weeklyPaceKg,
      });
      res.status(200).json(await this.buildGoalResponse(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePreviewGoalCalories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(goalPatchSchema, req.body, 'INVALID_GOAL_PREVIEW');
      const profile = await this.getUserProfile.execute(req.auth!.userId);
      if (!profile) {
        throw new ValidationError('GOAL_NOT_READY', 'User goal is not available');
      }

      const computed = computePlan({
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        gender: profile.gender,
        workoutsPerWeek: profile.workoutsPerWeek,
        goal: input.goalLabel ? fromGoalLabel(input.goalLabel) : profile.goal,
        weeklyPaceKg: input.weeklyPaceKg ?? profile.weeklyPaceKg,
      });

      res.status(200).json({ dailyCalories: computed.dailyCalories });
    } catch (error) {
      next(error);
    }
  };

  handleGetNotificationPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.status(200).json(await this.preferencesRepository.getNotificationPreferences(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePatchNotificationPreferences = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = parseOrThrow(
        notificationPreferencesSchema,
        req.body,
        'INVALID_NOTIFICATION_PREFERENCES_UPDATE',
      );
      res.status(200).json(
        await this.preferencesRepository.upsertNotificationPreferences(
          req.auth!.userId,
          input as NotificationPreferencesPatch,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  handleGetUnitPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.preferencesRepository.getUnitPreferences(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePatchUnitPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(unitPreferencesSchema, req.body, 'INVALID_UNIT_PREFERENCES_UPDATE');
      res.status(200).json(await this.preferencesRepository.upsertUnitPreferences(req.auth!.userId, input));
    } catch (error) {
      next(error);
    }
  };

  handleGetFavoriteRecipes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.catalogRepository.listFavoriteRecipes(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePostFavoriteRecipe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(favoriteRecipeSchema, req.body, 'INVALID_FAVORITE_RECIPE');
      res.status(201).json(
        await this.catalogRepository.createFavoriteRecipe({
          userId: req.auth!.userId,
          ...input,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  handleDeleteFavoriteRecipe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.params.id) {
        throw new ValidationError('INVALID_PARAMS', 'id is required');
      }
      await this.catalogRepository.deleteFavoriteRecipe(req.auth!.userId, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  handleGetMyMeals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.catalogRepository.listMyMeals(req.auth!.userId));
    } catch (error) {
      next(error);
    }
  };

  handlePostMyMeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(myMealCreateSchema, req.body, 'INVALID_SAVED_MEAL');
      res.status(201).json(
        await this.catalogRepository.createMyMeal({
          userId: req.auth!.userId,
          ...input,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  handlePatchMyMeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.params.id) {
        throw new ValidationError('INVALID_PARAMS', 'id is required');
      }
      const input = parseOrThrow(myMealUpdateSchema, req.body, 'INVALID_SAVED_MEAL_UPDATE');
      res.status(200).json(
        await this.catalogRepository.updateMyMeal({
          userId: req.auth!.userId,
          id: req.params.id,
          ...input,
        }),
      );
    } catch (error) {
      next(error);
    }
  };

  handleDeleteMyMeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.params.id) {
        throw new ValidationError('INVALID_PARAMS', 'id is required');
      }
      await this.catalogRepository.deleteMyMeal(req.auth!.userId, req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  handleGetSubscriptionPlans = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json([
      {
        id: 'yearly',
        period: 'yearly',
        priceFormatted: '$49.99/yr',
        priceCents: 4999,
        currency: 'USD',
        savePercent: 33,
      },
      {
        id: 'monthly',
        period: 'monthly',
        priceFormatted: '$5.99/mo',
        priceCents: 599,
        currency: 'USD',
        savePercent: 0,
      },
    ]);
  };
}
