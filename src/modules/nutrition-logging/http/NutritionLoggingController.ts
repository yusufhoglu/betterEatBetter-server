import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { mealTypes } from '../domain/MealItem';
import type { DeleteMealEntry } from '../use-cases/DeleteMealEntry';
import type { GetDaySummary } from '../use-cases/GetDaySummary';
import type { LogMealEntries } from '../use-cases/LogMealEntries';
import type { ReplaceMealSlotEntries } from '../use-cases/ReplaceMealSlotEntries';
import type { UpdateMealEntry } from '../use-cases/UpdateMealEntry';

const loggedMealEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  source: z.string().min(1).max(50).optional(),
  portionGrams: z.number().positive(),
  calories: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});

const logMealEntriesSchema = z.object({
  mealType: z.enum(mealTypes),
  timeZone: z.string().min(1),
  entries: z.array(loggedMealEntrySchema).min(1),
});

const replaceMealSlotSchema = z.object({
  mealType: z.enum(mealTypes),
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
  entries: z.array(loggedMealEntrySchema).min(1),
});

const updateMealEntrySchema = z.object({
  mealType: z.enum(mealTypes),
  timeZone: z.string().min(1),
  entry: loggedMealEntrySchema,
});

const deleteMealEntrySchema = z.object({
  mealType: z.enum(mealTypes),
  timeZone: z.string().min(1),
});

const summaryQuerySchema = z.object({
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }

  return parsed.data;
}

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

export class NutritionLoggingController {
  constructor(
    private readonly logMealEntries: LogMealEntries,
    private readonly replaceMealSlotEntries: ReplaceMealSlotEntries,
    private readonly getDaySummary: GetDaySummary,
    private readonly updateMealEntry: UpdateMealEntry,
    private readonly deleteMealEntry: DeleteMealEntry,
  ) {}

  handleLogMealEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(logMealEntriesSchema, req.body);
      const mealItem = await this.logMealEntries.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone),
        mealType: input.mealType,
        entries: input.entries,
      });
      res.status(201).json(mealItem);
    } catch (err) {
      next(err);
    }
  };

  handleGetDaySummary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parseOrThrow(summaryQuerySchema, req.query);
      const summary = await this.getDaySummary.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(query.timeZone, query.date),
      });
      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  };

  handleReplaceMealSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(replaceMealSlotSchema, req.body);
      const mealItem = await this.replaceMealSlotEntries.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone, input.date),
        mealType: input.mealType,
        entries: input.entries,
      });
      res.status(200).json(mealItem);
    } catch (err) {
      next(err);
    }
  };

  handleUpdateMealEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(updateMealEntrySchema, req.body);
      const entryId = req.params.entryId;
      if (!entryId) {
        throw new ValidationError('INVALID_PARAMS', 'entryId is required');
      }

      const mealItem = await this.updateMealEntry.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone),
        mealType: input.mealType,
        entryId,
        entry: input.entry,
      });
      res.status(200).json(mealItem);
    } catch (err) {
      next(err);
    }
  };

  handleDeleteMealEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(deleteMealEntrySchema, req.body);
      const entryId = req.params.entryId;
      if (!entryId) {
        throw new ValidationError('INVALID_PARAMS', 'entryId is required');
      }

      const mealItem = await this.deleteMealEntry.execute({
        userId: req.auth!.userId,
        date: resolveDateForTimeZone(input.timeZone),
        mealType: input.mealType,
        entryId,
      });
      res.status(200).json({ mealItem });
    } catch (err) {
      next(err);
    }
  };
}
