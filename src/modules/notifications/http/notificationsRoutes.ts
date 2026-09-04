import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaDeviceTokenRepository } from '../adapters/repository/PrismaDeviceTokenRepository';
import { RegisterDeviceToken } from '../use-cases/RegisterDeviceToken';
import { UnregisterDeviceToken } from '../use-cases/UnregisterDeviceToken';
import { NotificationsController } from './NotificationsController';

export function notificationsRoutes(): Router {
  const router = Router();

  const repository = new PrismaDeviceTokenRepository(prisma);
  const controller = new NotificationsController(
    new RegisterDeviceToken(repository),
    new UnregisterDeviceToken(repository),
  );

  router.post('/device-token', authMiddleware, controller.handleRegisterDeviceToken);
  router.delete('/device-token', authMiddleware, controller.handleUnregisterDeviceToken);

  return router;
}
