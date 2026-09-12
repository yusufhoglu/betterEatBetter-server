import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { AddWater } from '../use-cases/AddWater';
import type { GetWaterForDay } from '../use-cases/GetWaterForDay';
import type { RemoveLastWater } from '../use-cases/RemoveLastWater';

const summaryQuerySchema = z.object({
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
});

const addWaterSchema = z.object({
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
  amountMl: z.number().int().positive(),
});

const removeLastWaterSchema = z.object({
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
});

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  return parsed.data;
}

// Mirrors NutritionLoggingController's date resolution: an explicit
// YYYY-MM-DD wins, otherwise "today" is derived from the caller's time zone.
function resolveDateForTimeZone(timeZone: string, requestedDate?: string): Date {
  if (requestedDate) {
    const normalizedDate = new Date(`${requestedDate}T00:00:00.000Z`);
    if (Number.isNaN(normalizedDate.getTime())) {
      throw new ValidationError('INVALID_DATE', 'date must be formatted as YYYY-MM-DD');
    }
    return normalizedDate;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new ValidationError('INVALID_TIME_ZONE', 'Time zone could not be resolved');
    }

    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }

    throw new ValidationError('INVALID_TIME_ZONE', 'Invalid time zone');
  }
}

export class WaterLoggingController {
  constructor(
    private readonly getWaterForDay: GetWaterForDay,
    private readonly addWater: AddWater,
    private readonly removeLastWater: RemoveLastWater,
  ) {}

  handleGetDaySummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parseOrThrow(summaryQuerySchema, req.query);
      const result = await this.getWaterForDay.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(query.timeZone, query.date),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  handleAddWater = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(addWaterSchema, req.body);
      const result = await this.addWater.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone, input.date),
        amountMl: input.amountMl,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  handleRemoveLastWater = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(removeLastWaterSchema, req.body);
      const result = await this.removeLastWater.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone, input.date),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
