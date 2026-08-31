import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { EntitlementDetails, GetSubscriptionEntitlement } from '../use-cases/GetSubscriptionEntitlement';
import type { ProcessGooglePlayRtdn } from '../use-cases/ProcessGooglePlayRtdn';
import type { PurchaseSubscription } from '../use-cases/PurchaseSubscription';

// Wire shape from subscription-backend-contract.md — POST /verify and
// GET /entitlement both return exactly this.
const verifySchema = z.object({
  platform: z.literal('android'),
  productId: z.string().trim().min(1),
  purchaseToken: z.string().trim().min(1),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  return parsed.data;
}

function serializeEntitlement(entitlement: EntitlementDetails) {
  return {
    isPremium: entitlement.isPremium,
    productId: entitlement.productId,
    expiresAt: entitlement.expiresAt ? entitlement.expiresAt.toISOString() : null,
    willRenew: entitlement.willRenew,
    inGracePeriod: entitlement.inGracePeriod,
  };
}

export class SubscriptionController {
  constructor(
    private readonly purchaseSubscription: PurchaseSubscription,
    private readonly getSubscriptionEntitlement: GetSubscriptionEntitlement,
    private readonly processGooglePlayRtdn: ProcessGooglePlayRtdn,
  ) {}

  handleVerify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(verifySchema, req.body);
      await this.purchaseSubscription.execute({
        userId: req.auth!.userId,
        provider: 'google',
        productId: input.productId,
        receiptToken: input.purchaseToken,
      });

      const entitlement = await this.getSubscriptionEntitlement.describe(req.auth!.userId);
      res.status(200).json(serializeEntitlement(entitlement));
    } catch (error) {
      next(error);
    }
  };

  handleEntitlement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entitlement = await this.getSubscriptionEntitlement.describe(req.auth!.userId);
      res.status(200).json(serializeEntitlement(entitlement));
    } catch (error) {
      next(error);
    }
  };

  // No authMiddleware on this route — the caller is Cloud Pub/Sub, not one of
  // our users. ProcessGooglePlayRtdn verifies the push request's own bearer
  // token instead. Kept fast (parse + enqueue only) since Pub/Sub retries on
  // any non-2xx and expects a quick ack.
  handlePlayRtdn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.processGooglePlayRtdn.execute({
        authorizationHeader: req.header('authorization'),
        rawBody: req.body,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
