import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { AppleReceiptAdapter } from '../adapters/billing/AppleReceiptAdapter';
import { GoogleReceiptAdapter } from '../adapters/billing/GoogleReceiptAdapter';
import { PrismaSubscriptionRepository } from '../adapters/repository/PrismaSubscriptionRepository';
import { GetSubscriptionEntitlement } from '../use-cases/GetSubscriptionEntitlement';
import { PurchaseSubscription } from '../use-cases/PurchaseSubscription';
import { ValidateReceipt } from '../use-cases/ValidateReceipt';
import { SubscriptionController } from './SubscriptionController';

export function subscriptionRoutes(): Router {
  const router = Router();
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);
  const validateReceipt = new ValidateReceipt(new AppleReceiptAdapter(), new GoogleReceiptAdapter());
  const getSubscriptionEntitlement = new GetSubscriptionEntitlement(subscriptionRepository);
  const controller = new SubscriptionController(
    new PurchaseSubscription(validateReceipt, subscriptionRepository),
    getSubscriptionEntitlement,
    subscriptionRepository,
  );

  router.post('/purchase', authMiddleware, controller.handlePurchase);
  router.get('/status', authMiddleware, controller.handleStatus);

  return router;
}
