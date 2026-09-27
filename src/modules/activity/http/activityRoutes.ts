import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaStepLogRepository } from '../adapters/repository/PrismaStepLogRepository';
import { GetStepsForRange } from '../use-cases/GetStepsForRange';
import { SyncSteps } from '../use-cases/SyncSteps';
import { ActivityController } from './ActivityController';

/** Mounted at /activity. */
export function activityRoutes(): Router {
  const router = Router();

  const repository = new PrismaStepLogRepository(prisma);
  const controller = new ActivityController(new SyncSteps(repository), new GetStepsForRange(repository));

  router.put('/steps', authMiddleware, controller.handleSyncSteps);
  router.get('/steps', authMiddleware, controller.handleGetSteps);

  return router;
}
