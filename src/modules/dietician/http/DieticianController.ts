import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DomainError } from '../../../shared/errors/DomainError';
import { IntegrationError } from '../../../shared/errors/IntegrationError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { runWithContext } from '../../../shared/observability/tracer';
import { mealTypes } from '../../nutrition-logging/domain/MealItem';
import type { DieticianStreamChunk } from '../domain/DieticianStreamChunk';
import type { ConfirmMealProposal } from '../use-cases/ConfirmMealProposal';
import type { GetDieticianConversation } from '../use-cases/GetDieticianConversation';
import type { RunDieticianTurn } from '../use-cases/RunDieticianTurn';

const sendMessageBodySchema = z.object({
  content: z.string().min(1).max(4000),
  timeZone: z.string().min(1),
});

const getConversationQuerySchema = z.object({
  timeZone: z.string().min(1),
});

const confirmProposalBodySchema = z.object({
  mealType: z.enum(mealTypes),
  timeZone: z.string().min(1),
  date: z.string().date().optional(),
  applyMode: z.enum(['append', 'replace_meal_slot']).optional().default('append'),
});

const THINKING_EVENT_INTERVAL_MS = 2000;

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

function requireConversationId(req: Request): string {
  const conversationId = req.params.conversationId;
  if (!conversationId) {
    throw new ValidationError('INVALID_PARAMS', 'conversationId is required');
  }
  return conversationId;
}

/** Midnight-UTC Date for the user's local calendar day. */
function resolveLocalDate(timeZone: string, requestedDate?: string): Date {
  if (requestedDate) {
    const normalized = new Date(`${requestedDate}T00:00:00.000Z`);
    if (Number.isNaN(normalized.getTime())) {
      throw new ValidationError('INVALID_DATE', 'date must be formatted as YYYY-MM-DD');
    }
    return normalized;
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

function writeSseChunk(res: Response, chunk: DieticianStreamChunk): void {
  if (chunk.type === 'text') {
    res.write(`event: text\ndata: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
  } else {
    res.write(`event: proposal\ndata: ${JSON.stringify({ proposal: chunk.proposal })}\n\n`);
  }
}

function writeThinkingEvent(res: Response): void {
  res.write(`event: thinking\ndata: ${JSON.stringify({ status: 'thinking' })}\n\n`);
}

/** SSE endpoint for the dietician — trace_id = conversationId for the whole request. */
export class DieticianController {
  constructor(
    private readonly runDieticianTurn: RunDieticianTurn,
    private readonly getDieticianConversation: GetDieticianConversation,
    private readonly confirmMealProposal: ConfirmMealProposal,
  ) {}

  handleSendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const { content, timeZone } = parseOrThrow(sendMessageBodySchema, req.body);
      const userId = req.auth!.userId;
      const messageId = randomUUID();
      const today = resolveLocalDate(timeZone);

      await runWithContext(
        { traceId: conversationId, userId, messageId, isPremium: req.isPremium === true },
        async () => {
          const iterator = this.runDieticianTurn
            .execute({ userId, conversationId, content, today })
            [Symbol.asyncIterator]();

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'x-trace-id': conversationId,
          });
          res.flushHeaders?.();
          res.write(': connected\n\n');
          writeThinkingEvent(res);
          const heartbeat = setInterval(() => {
            writeThinkingEvent(res);
          }, THINKING_EVENT_INTERVAL_MS);

          try {
            let result = await iterator.next();
            while (!result.done) {
              writeSseChunk(res, result.value);
              result = await iterator.next();
            }
            res.write('event: done\ndata: {}\n\n');
          } catch (err) {
            const code = err instanceof DomainError ? err.code : 'STREAM_INTERRUPTED';
            const retryAfterSeconds = err instanceof IntegrationError ? err.retryAfterSeconds : undefined;
            res.write(
              `event: error\ndata: ${JSON.stringify(
                retryAfterSeconds !== undefined ? { code, retryAfterSeconds } : { code },
              )}\n\n`,
            );
          } finally {
            clearInterval(heartbeat);
            res.end();
          }
        },
      );
    } catch (error) {
      next(error);
    }
  };

  handleGetConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const { timeZone } = parseOrThrow(getConversationQuerySchema, req.query);
      const view = await this.getDieticianConversation.execute(
        req.auth!.userId,
        conversationId,
        resolveLocalDate(timeZone),
      );
      res.status(200).json(view);
    } catch (error) {
      next(error);
    }
  };

  handleConfirmMealProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const input = parseOrThrow(confirmProposalBodySchema, req.body);
      const mealItem = await this.confirmMealProposal.execute({
        userId: req.auth!.userId,
        conversationId,
        date: resolveLocalDate(input.timeZone, input.date),
        mealType: input.mealType,
        applyMode: input.applyMode ?? 'append',
      });
      res.status(201).json({ mealItem });
    } catch (error) {
      next(error);
    }
  };
}
