import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { getLocale } from '../../../shared/i18n/locale';
import type { RegisterDeviceToken } from '../use-cases/RegisterDeviceToken';
import type { UnregisterDeviceToken } from '../use-cases/UnregisterDeviceToken';

const registerSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(['ios', 'android']),
  timezone: z.string().trim().min(1),
  locale: z.enum(['en', 'tr']).optional(),
});

const unregisterSchema = z.object({
  token: z.string().trim().min(1),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  return parsed.data;
}

export class NotificationsController {
  constructor(
    private readonly registerDeviceToken: RegisterDeviceToken,
    private readonly unregisterDeviceToken: UnregisterDeviceToken,
  ) {}

  handleRegisterDeviceToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(registerSchema, req.body);
      const { id } = await this.registerDeviceToken.execute({
        userId: req.auth!.userId,
        token: input.token,
        platform: input.platform,
        timezone: input.timezone,
        locale: input.locale ?? getLocale(req),
      });
      res.status(200).json({ id });
    } catch (error) {
      next(error);
    }
  };

  handleUnregisterDeviceToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(unregisterSchema, req.body);
      await this.unregisterDeviceToken.execute({ token: input.token });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
