import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaMealItemRepository } from '../adapters/repository/PrismaMealItemRepository';
import { OnboardingPlanTargetsAdapter } from '../adapters/targets/OnboardingPlanTargetsAdapter';
import { MealLoggedEventPublisher } from '../events/publishers/MealLoggedEventPublisher';
import { DeleteMealEntry } from '../use-cases/DeleteMealEntry';
import { GetDaySummary } from '../use-cases/GetDaySummary';
import { LogMealEntries } from '../use-cases/LogMealEntries';
import { UpdateMealEntry } from '../use-cases/UpdateMealEntry';
import { NutritionLoggingController } from './NutritionLoggingController';

export function nutritionLoggingRoutes(): Router {
  const router = Router();

  const repository = new PrismaMealItemRepository(prisma);
  const dailyTargetsPort = new OnboardingPlanTargetsAdapter();
  const eventPublisher = new MealLoggedEventPublisher();

  const logMealEntries = new LogMealEntries(repository, eventPublisher);
  const getDaySummary = new GetDaySummary(repository, dailyTargetsPort);
  const updateMealEntry = new UpdateMealEntry(repository, eventPublisher);
  const deleteMealEntry = new DeleteMealEntry(repository, eventPublisher);

  const controller = new NutritionLoggingController(
    logMealEntries,
    getDaySummary,
    updateMealEntry,
    deleteMealEntry,
  );

  router.post('/', authMiddleware, controller.handleLogMealEntries);
  router.get('/day-summary', authMiddleware, controller.handleGetDaySummary);
  router.patch('/entries/:entryId', authMiddleware, controller.handleUpdateMealEntry);
  router.delete('/entries/:entryId', authMiddleware, controller.handleDeleteMealEntry);

  return router;
}
