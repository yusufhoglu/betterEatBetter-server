import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { AdminController } from './AdminController';
import { buildAdminUseCases } from './adminWiring';

export function adminRoutes(): Router {
  const router = Router();
  const controller = new AdminController(buildAdminUseCases());

  router.use(authMiddleware, controller.requireAdmin);

  router.get('/me', controller.handleMe);
  router.get('/overview', controller.handleOverview);
  router.get('/audit', controller.handleAudit);

  router.get('/users', controller.handleListUsers);
  router.get('/users/:userId', controller.handleGetUser);
  router.post('/users/:userId/suspend', controller.handleSuspendUser);
  router.post('/users/:userId/unsuspend', controller.handleUnsuspendUser);
  router.put('/users/:userId/premium', controller.handleSetPremium);
  router.post('/users/:userId/reassign', controller.handleReassignClient);

  router.get('/dietitians', controller.handleListDietitians);
  router.get('/dietitians/:userId', controller.handleGetDietitian);
  router.post('/dietitians/:userId/suspend', controller.handleSuspendDietitian);
  router.post('/dietitians/:userId/unsuspend', controller.handleUnsuspendDietitian);

  router.get('/activation-codes', controller.handleListCodes);
  router.post('/activation-codes', controller.handleCreateCode);
  router.post('/activation-codes/:codeId/revoke', controller.handleRevokeCode);

  return router;
}
