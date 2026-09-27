import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { RealtimeEvent } from '../domain/messagingTypes';
import type { CreateChatAttachmentUpload } from '../use-cases/CreateChatAttachmentUpload';
import type { ListMessages } from '../use-cases/ListMessages';
import type { ListThreads } from '../use-cases/ListThreads';
import type { MarkThreadRead } from '../use-cases/MarkThreadRead';
import type { SendMessage } from '../use-cases/SendMessage';

const logger = createModuleLogger('messaging');
const HEARTBEAT_MS = 25_000;

const listMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const attachmentSchema = z.object({
  kind: z.literal('image'),
  key: z.string().min(1).max(512),
  contentType: z.string().min(1).max(100),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const sendMessageSchema = z.object({
  clientMessageId: z.string().min(1).max(64),
  type: z.enum(['text', 'image']).default('text'),
  body: z.string().max(4000).nullable().optional(),
  attachments: z.array(attachmentSchema).max(4).optional(),
});

const markReadSchema = z.object({ messageId: z.string().uuid() });
const attachmentUploadSchema = z.object({ contentType: z.string().min(1) });
const threadParamsSchema = z.object({ threadId: z.string().uuid() });

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

export type RealtimeSubscribe = (
  userId: string,
  listener: (event: RealtimeEvent) => void,
) => Promise<() => Promise<void>>;

export class MessagingController {
  constructor(
    private readonly listThreads: ListThreads,
    private readonly listMessages: ListMessages,
    private readonly sendMessage: SendMessage,
    private readonly markThreadRead: MarkThreadRead,
    private readonly createAttachmentUpload: CreateChatAttachmentUpload,
    private readonly subscribe: RealtimeSubscribe,
  ) {}

  handleListThreads = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({ items: await this.listThreads.execute(req.auth!.userId) });
    } catch (err) {
      next(err);
    }
  };

  handleListMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { threadId } = parseOrThrow(threadParamsSchema, req.params);
      const query = parseOrThrow(listMessagesQuerySchema, req.query);
      res.status(200).json(await this.listMessages.execute(req.auth!.userId, threadId, query));
    } catch (err) {
      next(err);
    }
  };

  handleSendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { threadId } = parseOrThrow(threadParamsSchema, req.params);
      const input = parseOrThrow(sendMessageSchema, req.body);
      const result = await this.sendMessage.execute({ senderId: req.auth!.userId, threadId, ...input });
      res.status(result.created ? 201 : 200).json(result.message);
    } catch (err) {
      next(err);
    }
  };

  handleMarkRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { threadId } = parseOrThrow(threadParamsSchema, req.params);
      const { messageId } = parseOrThrow(markReadSchema, req.body);
      res.status(200).json(await this.markThreadRead.execute(req.auth!.userId, threadId, messageId));
    } catch (err) {
      next(err);
    }
  };

  handleCreateAttachmentUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { threadId } = parseOrThrow(threadParamsSchema, req.params);
      const { contentType } = parseOrThrow(attachmentUploadSchema, req.body);
      res.status(201).json(await this.createAttachmentUpload.execute(req.auth!.userId, threadId, contentType));
    } catch (err) {
      next(err);
    }
  };

  /**
   * One long-lived SSE stream per app session carrying every realtime event
   * for the user. Clients reconnect on drop and refetch GET /threads to
   * catch up — events are not replayed.
   */
  handleStream = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.auth!.userId;
    let unsubscribe: (() => Promise<void>) | undefined;
    try {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();
      res.write('retry: 3000\n\n');

      unsubscribe = await this.subscribe(userId, (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      res.write('event: ready\ndata: {}\n\n');

      const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
      req.on('close', () => {
        clearInterval(heartbeat);
        void unsubscribe?.().catch((err: unknown) => logger.warn({ err }, 'realtime cleanup failed'));
      });
    } catch (err) {
      await unsubscribe?.();
      if (res.headersSent) {
        res.end();
        return;
      }
      next(err);
    }
  };
}
