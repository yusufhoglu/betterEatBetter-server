import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { GetSubscriptionEntitlement } from '../use-cases/GetSubscriptionEntitlement';
import type { PurchaseSubscription } from '../use-cases/PurchaseSubscription';
import type { SubscriptionRepositoryPort } from '../ports/SubscriptionRepositoryPort';

const purchaseSchema = z.object({
  provider: z.enum(['apple', 'google']),
  productId: z.string().trim().min(1),
  receiptToken: z.string().trim().min(1),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  return parsed.data;
}

export class SubscriptionController {
  constructor(
    private readonly purchaseSubscription: PurchaseSubscription,
    private readonly getSubscriptionEntitlement: GetSubscriptionEntitlement,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
  ) {}

  handlePurchase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(purchaseSchema, req.body);
      const subscription = await this.purchaseSubscription.execute({
        userId: req.auth!.userId,
        provider: input.provider,
        productId: input.productId,
        receiptToken: input.receiptToken,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });

      res.status(200).json({
        id: subscription.id,
        provider: subscription.provider,
        productId: subscription.productId,
        status: subscription.status,
        expiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
        isPremium: await this.getSubscriptionEntitlement.execute(req.auth!.userId),
      });
    } catch (error) {
      next(error);
    }
  };

  handleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subscription = await this.subscriptionRepository.findLatestByUserId(req.auth!.userId);
      res.status(200).json({
        isPremium: await this.getSubscriptionEntitlement.execute(req.auth!.userId),
        provider: subscription?.provider ?? null,
        productId: subscription?.productId ?? null,
        status: subscription?.status ?? null,
        expiresAt: subscription?.expiresAt ? subscription.expiresAt.toISOString() : null,
      });
    } catch (error) {
      next(error);
    }
  };
}
