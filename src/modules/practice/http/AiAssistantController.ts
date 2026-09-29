import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { AI_ADDRESS_FORMS, AI_LIMITS } from '../domain/aiAssistant';
import type { AiAssistantSettings } from '../use-cases/AiAssistantSettings';
import type { ClientAiAssistant } from '../use-cases/ClientAiAssistant';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));
const textList = z.array(z.string().trim().max(AI_LIMITS.listItemLength)).max(AI_LIMITS.maxListItems);

const settingsSchema = z.object({
  enabled: z.boolean(),
  defaultClientAccess: z.boolean(),
  assistantName: optionalText(AI_LIMITS.assistantNameLength),
  addressForm: z.enum(AI_ADDRESS_FORMS).nullable(),
  tone: optionalText(AI_LIMITS.shortTextLength),
  approach: optionalText(AI_LIMITS.longTextLength),
  rules: textList,
  avoid: textList,
  handoffMessage: optionalText(AI_LIMITS.shortTextLength),
  schedule: z
    .object({
      timeZone: z.string().min(1).max(64),
      windows: z
        .array(
          z.object({
            days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
            start: z.string().regex(/^\d{2}:\d{2}$/),
            end: z.string().regex(/^\d{2}:\d{2}$/),
          }),
        )
        .max(AI_LIMITS.maxScheduleWindows),
    })
    .nullable(),
});
const exampleSchema = z.object({
  question: z.string().trim().min(1).max(AI_LIMITS.exampleQuestionLength),
  answer: z.string().trim().min(1).max(AI_LIMITS.exampleAnswerLength),
  sourceMessageId: z.string().uuid().nullable().optional(),
});
const examplePatchSchema = exampleSchema.omit({ sourceMessageId: true }).partial();
const exampleParamsSchema = z.object({ exampleId: z.string().uuid() });
const previewSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(20),
});
const clientParamsSchema = z.object({ clientId: z.string().uuid() });
const conversationParamsSchema = clientParamsSchema.extend({ conversationId: z.string().min(1).max(100) });
const clientAiSchema = z.object({
  access: z.enum(['on', 'off']).nullable(),
  instructions: optionalText(AI_LIMITS.clientInstructionsLength),
});

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

type Handler = (req: Request, res: Response) => Promise<void>;

function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };
}

/** `/practice/ai/*` (the dietitian's assistant) and `/practice/clients/:clientId/ai*` (one client). */
export class AiAssistantController {
  constructor(
    private readonly settings: AiAssistantSettings,
    private readonly clientAi: ClientAiAssistant,
    /** Preview runs the prime model — throttled per dietitian. */
    private readonly previewRateLimit: (key: string) => Promise<void>,
  ) {}

  handleGetSettings = handle(async (req, res) => {
    res.status(200).json(await this.settings.get(req.auth!.userId));
  });

  handleUpdateSettings = handle(async (req, res) => {
    const input = parseOrThrow(settingsSchema, req.body);
    res.status(200).json(await this.settings.update(req.auth!.userId, input));
  });

  handlePreview = handle(async (req, res) => {
    const { messages } = parseOrThrow(previewSchema, req.body);
    await this.previewRateLimit(`practice-ai-preview:${req.auth!.userId}`);
    res.status(200).json(await this.settings.previewReply(req.auth!.userId, messages));
  });

  handleListExamples = handle(async (req, res) => {
    res.status(200).json({ items: await this.settings.listExamples(req.auth!.userId) });
  });

  handleCreateExample = handle(async (req, res) => {
    const input = parseOrThrow(exampleSchema, req.body);
    res.status(201).json(await this.settings.createExample(req.auth!.userId, input));
  });

  handleUpdateExample = handle(async (req, res) => {
    const { exampleId } = parseOrThrow(exampleParamsSchema, req.params);
    const patch = parseOrThrow(examplePatchSchema, req.body);
    res.status(200).json(await this.settings.updateExample(req.auth!.userId, exampleId, patch));
  });

  handleDeleteExample = handle(async (req, res) => {
    const { exampleId } = parseOrThrow(exampleParamsSchema, req.params);
    await this.settings.deleteExample(req.auth!.userId, exampleId);
    res.status(204).end();
  });

  handleGetClientAi = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    res.status(200).json(await this.clientAi.get(req.auth!.userId, clientId));
  });

  handleUpdateClientAi = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const input = parseOrThrow(clientAiSchema, req.body);
    res.status(200).json(await this.clientAi.update(req.auth!.userId, clientId, input));
  });

  handleListClientAiConversations = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    res.status(200).json({ items: await this.clientAi.listConversations(req.auth!.userId, clientId) });
  });

  handleGetClientAiConversation = handle(async (req, res) => {
    const { clientId, conversationId } = parseOrThrow(conversationParamsSchema, req.params);
    res
      .status(200)
      .json({ items: await this.clientAi.getConversation(req.auth!.userId, clientId, conversationId) });
  });
}
