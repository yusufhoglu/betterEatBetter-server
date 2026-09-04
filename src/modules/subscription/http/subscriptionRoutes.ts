import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { prisma } from '../../../shared/persistence/db';
import { AppleReceiptAdapter } from '../adapters/billing/AppleReceiptAdapter';
import { GooglePubSubVerifier } from '../adapters/billing/GooglePubSubVerifier';
import { GoogleReceiptAdapter } from '../adapters/billing/GoogleReceiptAdapter';
import { ResilientGoogleReceiptAdapter } from '../adapters/billing/ResilientGoogleReceiptAdapter';
import { PrismaSubscriptionRepository } from '../adapters/repository/PrismaSubscriptionRepository';
import { RedisEntitlementCache } from '../entitlement/RedisEntitlementCache';
import { GetSubscriptionEntitlement } from '../use-cases/GetSubscriptionEntitlement';
import { ProcessGooglePlayRtdn } from '../use-cases/ProcessGooglePlayRtdn';
import { PurchaseSubscription } from '../use-cases/PurchaseSubscription';
import { ValidateReceipt } from '../use-cases/ValidateReceipt';
import { SubscriptionController } from './SubscriptionController';

export function subscriptionRoutes(): Router {
  const router = Router();
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);
  const validateReceipt = new ValidateReceipt(
    new AppleReceiptAdapter(),
    new ResilientGoogleReceiptAdapter(new GoogleReceiptAdapter()),
  );
  const getSubscriptionEntitlement = new GetSubscriptionEntitlement(subscriptionRepository);
  const entitlementCache = new RedisEntitlementCache(cacheRedisClient);
  const processGooglePlayRtdn = new ProcessGooglePlayRtdn(new GooglePubSubVerifier());
  const controller = new SubscriptionController(
    new PurchaseSubscription(validateReceipt, subscriptionRepository, entitlementCache),
    getSubscriptionEntitlement,
    processGooglePlayRtdn,
  );

  // Routes and shapes follow subscription-backend-contract.md exactly — the
  // mobile app is wired to these specific paths/fields.
  router.post('/verify', authMiddleware, controller.handleVerify);
  router.get('/entitlement', authMiddleware, controller.handleEntitlement);
  // No authMiddleware — Cloud Pub/Sub push subscription calls this directly,
  // authenticated via its own OIDC bearer token (see GooglePubSubVerifier).
  router.post('/play-rtdn', controller.handlePlayRtdn);

  return router;
}
