import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaSharedMealSync } from '../../social/adapters/PrismaSharedMealSync';
import { PrismaMealItemRepository } from '../adapters/repository/PrismaMealItemRepository';
import { OnboardingPlanTargetsAdapter } from '../adapters/targets/OnboardingPlanTargetsAdapter';
import { MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import { DeleteMealEntry } from '../use-cases/DeleteMealEntry';
import { GetDaySummary } from '../use-cases/GetDaySummary';
import { GetMealHistory } from '../use-cases/GetMealHistory';
import { LogMealEntries } from '../use-cases/LogMealEntries';
import { ReplaceMealSlotEntries } from '../use-cases/ReplaceMealSlotEntries';
import { UpdateMealEntry } from '../use-cases/UpdateMealEntry';
import { NutritionLoggingController } from './NutritionLoggingController';

export function nutritionLoggingRoutes(): Router {
  const router = Router();

  const repository = new PrismaMealItemRepository(prisma);
  const dailyTargetsPort = new OnboardingPlanTargetsAdapter();
  const eventPublisher = new MealLoggedEventPublisher();
  // When an author edits a meal they've shared, keep the feed post's
  // denormalized macro columns (used by the calorie / macro filter) in sync.
  const sharedMeal = new PrismaSharedMealSync(prisma);

  const logMealEntries = new LogMealEntries(repository, eventPublisher);
  const replaceMealSlotEntries = new ReplaceMealSlotEntries(
    repository,
    eventPublisher,
    undefined,
    sharedMeal,
  );
  const getDaySummary = new GetDaySummary(repository, dailyTargetsPort);
  const updateMealEntry = new UpdateMealEntry(repository, eventPublisher, undefined, sharedMeal);
  const deleteMealEntry = new DeleteMealEntry(repository, eventPublisher);
  const getMealHistory = new GetMealHistory(repository);

  const controller = new NutritionLoggingController(
    logMealEntries,
    replaceMealSlotEntries,
    getDaySummary,
    updateMealEntry,
    deleteMealEntry,
    getMealHistory,
  );

  router.post('/', authMiddleware, controller.handleLogMealEntries);
  router.put('/meal-slot', authMiddleware, controller.handleReplaceMealSlot);
  router.get('/day-summary', authMiddleware, controller.handleGetDaySummary);
  router.get('/history', authMiddleware, controller.handleGetMealHistory);
  router.patch('/entries/:entryId', authMiddleware, controller.handleUpdateMealEntry);
  router.delete('/entries/:entryId', authMiddleware, controller.handleDeleteMealEntry);

  return router;
}
