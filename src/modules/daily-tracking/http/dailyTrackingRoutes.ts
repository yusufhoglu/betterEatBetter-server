import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { GetLoggedMealTypesForDateRange } from '../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { NutritionLoggingDayLogsAdapter } from '../adapters/dayLogs/NutritionLoggingDayLogsAdapter';
import { GetTodayStatus } from '../use-cases/GetTodayStatus';
import { GetWeekProgress } from '../use-cases/GetWeekProgress';
import { DailyTrackingController } from './DailyTrackingController';

export function dailyTrackingRoutes(): Router {
  const router = Router();

  const repository = new PrismaMealItemRepository(prisma);
  const getLoggedMealTypesForDateRange = new GetLoggedMealTypesForDateRange(repository);
  const dayLogsPort = new NutritionLoggingDayLogsAdapter(getLoggedMealTypesForDateRange);
  const getTodayStatus = new GetTodayStatus(dayLogsPort);
  const getWeekProgress = new GetWeekProgress(dayLogsPort);
  const controller = new DailyTrackingController(getTodayStatus, getWeekProgress);

  router.get('/today-status', authMiddleware, controller.handleGetTodayStatus);
  router.get('/week-progress', authMiddleware, controller.handleGetWeekProgress);

  return router;
}
