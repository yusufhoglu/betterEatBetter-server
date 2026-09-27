import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { resolveUserToday } from '../../../shared/domain/resolveUserToday';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { MAX_SYNC_DAYS, STEP_SOURCES } from '../domain/StepLog';
import type { GetStepsForRange } from '../use-cases/GetStepsForRange';
import type { SyncSteps } from '../use-cases/SyncSteps';

const syncSchema = z.object({
  timeZone: z.string().min(1),
  source: z.enum(STEP_SOURCES),
  days: z.array(z.object({ date: z.string().date(), steps: z.number().int() })).min(1).max(MAX_SYNC_DAYS),
});

const rangeSchema = z.object({
  timeZone: z.string().min(1),
  from: z.string().date(),
  to: z.string().date().optional(),
});

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

const asDay = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export class ActivityController {
  constructor(
    private readonly syncSteps: SyncSteps,
    private readonly getStepsForRange: GetStepsForRange,
  ) {}

  handleSyncSteps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(syncSchema, req.body);
      const result = await this.syncSteps.execute({
        userId: req.auth!.userId,
        today: resolveUserToday({ timeZone: input.timeZone }),
        source: input.source,
        days: input.days.map((d) => ({ date: asDay(d.date), steps: d.steps })),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  handleGetSteps = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parseOrThrow(rangeSchema, req.query);
      const to = query.to ? asDay(query.to) : resolveUserToday({ timeZone: query.timeZone });
      const items = await this.getStepsForRange.execute(req.auth!.userId, asDay(query.from), to);
      res.status(200).json({ items });
    } catch (err) {
      next(err);
    }
  };
}
