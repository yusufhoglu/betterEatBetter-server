import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { DomainError } from '../../../shared/errors/DomainError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { runWithContext } from '../../../shared/observability/tracer';
import { mealTypes } from '../../nutrition-logging/domain/MealItem';
import type { ChatStreamChunk } from '../domain/ChatStreamChunk';
import type { ConfirmMealProposal } from '../use-cases/ConfirmMealProposal';
import type { GetConversationHistory } from '../use-cases/GetConversationHistory';
import type { SeedPhotoMealProposal } from '../use-cases/SeedPhotoMealProposal';
import type { SendMessage } from '../use-cases/SendMessage';

const logger = createModuleLogger('chatbot');

const sendMessageBodySchema = z.object({
  content: z.string().min(1).max(4000),
});

const seedPhotoProposalBodySchema = z.object({
  mealPhotoId: z.string().min(1),
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

/** Mobile renders these into separate UI elements — a text bubble vs. a proposal card. */
function writeSseChunk(res: Response, chunk: ChatStreamChunk): void {
  if (chunk.type === 'text') {
    res.write(`event: text\ndata: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
  } else {
    res.write(`event: proposal\ndata: ${JSON.stringify({ proposal: chunk.proposal })}\n\n`);
  }
}

function writeThinkingEvent(res: Response): void {
  res.write(`event: thinking\ndata: ${JSON.stringify({ status: 'thinking' })}\n\n`);
}

/** SSE endpoint for chat — trace_id = conversationId for the whole request. */
export class ChatController {
  constructor(
    private readonly sendMessage: SendMessage,
    private readonly getConversationHistory: GetConversationHistory,
    private readonly seedPhotoMealProposal: SeedPhotoMealProposal,
    private readonly confirmMealProposal: ConfirmMealProposal,
  ) {}

  handleSendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const { content } = parseOrThrow(sendMessageBodySchema, req.body);
      const userId = req.auth!.userId;
      const messageId = randomUUID();

      const incomingTraceId = req.header('x-trace-id');
      if (incomingTraceId && incomingTraceId !== conversationId) {
        logger.warn(
          { incomingTraceId, conversationId },
          'x-trace-id does not match conversationId; using conversationId as trace_id',
        );
      }

      await runWithContext({ traceId: conversationId, userId, messageId }, async () => {
        const iterator = this.sendMessage
          .execute({ userId, conversationId, content })
          [Symbol.asyncIterator]();

        // Pulling the first chunk runs findOrCreate/appendMessage/the whole tool
        // loop (proposal chunks included) — it can still throw a normal
        // DomainError there. Only once we've got a chunk to send do we commit to
        // the SSE response; any failure from that point on (including inside
        // streamFinalReply) becomes an `error` event instead of a JSON response.
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'x-trace-id': conversationId,
        });
        res.flushHeaders?.();
        // Emit an immediate SSE frame so clients can treat the stream as open
        // while the first model/tool chunk is still being prepared.
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
          res.write(`event: error\ndata: ${JSON.stringify({ code })}\n\n`);
        } finally {
          clearInterval(heartbeat);
          res.end();
        }
      });
    } catch (error) {
      next(error);
    }
  };

  handleGetConversationHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const conversation = await this.getConversationHistory.execute(req.auth!.userId, conversationId);
      res.status(200).json(conversation);
    } catch (error) {
      next(error);
    }
  };

  handleSeedPhotoProposal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = requireConversationId(req);
      const { mealPhotoId } = parseOrThrow(seedPhotoProposalBodySchema, req.body);
      const proposal = await this.seedPhotoMealProposal.execute({
        userId: req.auth!.userId,
        conversationId,
        mealPhotoId,
      });
      res.status(201).json({ proposal });
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
        date: resolveDateForTimeZone(input.timeZone, input.date),
        mealType: input.mealType,
        applyMode: input.applyMode ?? 'append',
      });
      res.status(201).json({ mealItem });
    } catch (error) {
      next(error);
    }
  };
}
