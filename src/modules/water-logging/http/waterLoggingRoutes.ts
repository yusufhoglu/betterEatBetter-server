import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaWaterLogRepository } from '../adapters/repository/PrismaWaterLogRepository';
import { AddWater } from '../use-cases/AddWater';
import { GetWaterForDay } from '../use-cases/GetWaterForDay';
import { RemoveLastWater } from '../use-cases/RemoveLastWater';
import { WaterLoggingController } from './WaterLoggingController';

export function waterLoggingRoutes(): Router {
  const router = Router();

  const repository = new PrismaWaterLogRepository(prisma);

  const getWaterForDay = new GetWaterForDay(repository);
  const addWater = new AddWater(repository);
  const removeLastWater = new RemoveLastWater(repository);

  const controller = new WaterLoggingController(getWaterForDay, addWater, removeLastWater);

  router.get('/day-summary', authMiddleware, controller.handleGetDaySummary);
  router.post('/add', authMiddleware, controller.handleAddWater);
  router.post('/remove-last', authMiddleware, controller.handleRemoveLastWater);

  return router;
}
