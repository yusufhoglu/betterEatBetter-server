import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../../shared/config/env';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { runWithContext } from '../../../shared/observability/tracer';
import { TRACE_ID_HEADER } from '../../../shared/observability/tracingMiddleware';
import { consumeDailyQuota, refundDailyQuota } from '../../../shared/rateLimiting/dailyQuota';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import type { RecognizeFromPhoto } from '../use-cases/RecognizeFromPhoto';
import type { RecognizeFromBarcode } from '../use-cases/RecognizeFromBarcode';
import type { RecognizeFromText } from '../use-cases/RecognizeFromText';
import type { SearchFoodCatalog } from '../use-cases/SearchFoodCatalog';
import type { FoodEntryRepositoryPort } from '../ports/FoodEntryRepositoryPort';

const photoBodySchema = z.object({ mealPhotoId: z.string().min(1) });
const barcodeBodySchema = z.object({ barcode: z.string().min(1) });
const textBodySchema = z.object({ text: z.string().min(1).max(500) });
const searchQuerySchema = z.object({ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(100).optional() });
const logger = createModuleLogger('food-recognition');

function warnOnTraceMismatch(req: Request, traceId: string): void {
  const incomingTraceId = req.header(TRACE_ID_HEADER);
  if (incomingTraceId && incomingTraceId !== traceId) {
    logger.warn(
      { incomingTraceId, traceId },
      'x-trace-id does not match mealPhotoId; using mealPhotoId as trace_id',
    );
  }
}

export class FoodRecognitionController {
  constructor(
    private readonly recognizeFromPhoto: RecognizeFromPhoto,
    private readonly recognizeFromBarcode: RecognizeFromBarcode,
    private readonly recognizeFromText: RecognizeFromText,
    private readonly searchFoodCatalog: SearchFoodCatalog,
    private readonly repository: FoodEntryRepositoryPort,
  ) {}

  /** POST /food/photo - async, returns 202 */
  async handlePhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.auth!.userId;
      const parsed = photoBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', 'mealPhotoId is required');
      }

      const { mealPhotoId } = parsed.data;
      warnOnTraceMismatch(req, mealPhotoId);
      res.setHeader(TRACE_ID_HEADER, mealPhotoId);

      await runWithContext({ traceId: mealPhotoId, userId }, async () => {
        logger.info({ mealPhotoId, userId }, 'photo recognition request received');
        await checkRateLimit(`photo:${userId}`, 5, 60);

        // Free-tier users get FREE_DAILY_PHOTO_LIMIT photo logs per UTC day;
        // premium bypasses. Consumed here, before the async pipeline — but
        // refunded if the photo never makes it in (invalid/oversized image).
        // A failure further downstream (RAG) still burns the day's scan.
        const isPremium = req.isPremium === true;
        if (!isPremium) {
          await consumeDailyQuota(`photo:${userId}`, env.FREE_DAILY_PHOTO_LIMIT);
        }

        try {
          const result = await this.recognizeFromPhoto.execute({ mealPhotoId, userId });
          logger.info({ mealPhotoId: result.mealPhotoId, userId }, 'photo recognition request accepted');
          res.status(202).json({ mealPhotoId: result.mealPhotoId });
        } catch (err) {
          if (!isPremium && err instanceof ValidationError) {
            await refundDailyQuota(`photo:${userId}`);
          }
          throw err;
        }
      });
    } catch (err) {
      logger.error({ err, body: req.body, userId: req.auth?.userId }, 'photo recognition request failed');
      next(err);
    }
  }

  /** GET /food/photo/:mealPhotoId - polling endpoint */
  async handleGetPhotoStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mealPhotoId } = req.params;
      if (!mealPhotoId) {
        throw new ValidationError('INVALID_PARAMS', 'mealPhotoId is required');
      }

      const userId = req.auth!.userId;
      warnOnTraceMismatch(req, mealPhotoId);
      res.setHeader(TRACE_ID_HEADER, mealPhotoId);

      await runWithContext({ traceId: mealPhotoId, userId }, async () => {
        const entry = await this.repository.findById(mealPhotoId);

        if (!entry) {
          res.status(404).json({ code: 'FOOD_ENTRY_NOT_FOUND' });
          return;
        }

        res.status(200).json(entry);
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /food/barcode - synchronous, returns 200 */
  async handleBarcode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.auth!.userId;
      await checkRateLimit(`barcode:${userId}`, 10, 60);

      const parsed = barcodeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', 'barcode is required');
      }

      const result = await this.recognizeFromBarcode.execute({ barcode: parsed.data.barcode, userId });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /** POST /food/text - synchronous, returns 200 */
  async handleText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.auth!.userId;
      await checkRateLimit(`text:${userId}`, 10, 60);

      const parsed = textBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_BODY', 'text is required (max 500 chars)');
      }

      const result = await this.recognizeFromText.execute({ text: parsed.data.text, userId });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /food/search - synchronous, no rate limit */
  async handleSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = searchQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError('INVALID_QUERY', 'q is required');
      }

      const result = await this.searchFoodCatalog.execute({
        query: parsed.data.q,
        limit: parsed.data.limit,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
}
