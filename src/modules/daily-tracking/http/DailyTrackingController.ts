import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { GetTodayStatus } from '../use-cases/GetTodayStatus';
import type { GetWeekProgress } from '../use-cases/GetWeekProgress';

const weekProgressQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be in YYYY-MM-DD format'),
});

function parseWeekStart(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('INVALID_WEEK_START', 'weekStart must be a valid date');
  }

  return parsed;
}

/** Exposes read-only endpoints for today's status and weekly completion. */
export class DailyTrackingController {
  constructor(
    private readonly getTodayStatus: GetTodayStatus,
    private readonly getWeekProgress: GetWeekProgress,
  ) {}

  handleGetTodayStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.getTodayStatus.execute({ userId: req.auth!.userId });
      res.status(200).json(status);
    } catch (err) {
      next(err);
    }
  };

  handleGetWeekProgress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = weekProgressQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('INVALID_QUERY', parsed.error.issues[0]?.message ?? 'Invalid query');
      }

      const progress = await this.getWeekProgress.execute({
        userId: req.auth!.userId,
        weekStartDate: parseWeekStart(parsed.data.weekStart),
      });

      res.status(200).json(Object.fromEntries(progress));
    } catch (err) {
      next(err);
    }
  };
}
