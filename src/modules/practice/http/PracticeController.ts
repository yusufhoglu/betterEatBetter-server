import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { resolveUserToday } from '../../../shared/domain/resolveUserToday';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { CONSENT_SCOPES } from '../domain/practiceTypes';
import type { ActivateDietitian } from '../use-cases/ActivateDietitian';
import type { AlertRuleSettings } from '../use-cases/AlertRuleSettings';
import type { GetClientAnalytics } from '../use-cases/GetClientAnalytics';
import type { ClientNotes } from '../use-cases/ClientNotes';
import type { CreateInviteCode } from '../use-cases/CreateInviteCode';
import type { EndLink } from '../use-cases/EndLink';
import type { GetClientOverview } from '../use-cases/GetClientOverview';
import type { GetMyAccessLog } from '../use-cases/GetMyAccessLog';
import type { GetMyLink } from '../use-cases/GetMyLink';
import type { GetPracticeMe } from '../use-cases/GetPracticeMe';
import type { JoinDietitian } from '../use-cases/JoinDietitian';
import type { ListClients } from '../use-cases/ListClients';
import type { ListOrganizationMembers } from '../use-cases/ListOrganizationMembers';
import type { PreviewInvite } from '../use-cases/PreviewInvite';
import type { ReadClientData } from '../use-cases/ReadClientData';
import type { ReassignClient } from '../use-cases/ReassignClient';
import type { RotateInviteKey } from '../use-cases/RotateInviteKey';
import type { SetClientPlan } from '../use-cases/SetClientPlan';
import type { UpdateConsent } from '../use-cases/UpdateConsent';
import type { UpdateDietitianProfile } from '../use-cases/UpdateDietitianProfile';

const consentScopesSchema = z.array(z.enum(CONSENT_SCOPES)).max(CONSENT_SCOPES.length);
const codeSchema = z.object({ code: z.string().min(4).max(40) });
const joinSchema = codeSchema.extend({ consentScopes: consentScopesSchema });
const consentSchema = z.object({ consentScopes: consentScopesSchema });
const orgQuerySchema = z.object({ organizationId: z.string().uuid().optional() });
const createInviteSchema = z.object({
  organizationId: z.string().uuid().optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
});
const profileSchema = z.object({
  title: z.string().trim().max(100).nullable().optional(),
  licenseNo: z.string().trim().max(50).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});
const listClientsSchema = z.object({
  view: z.enum(['mine', 'organization']).default('mine'),
  organizationId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  timeZone: z.string().min(1).optional(),
});
const clientParamsSchema = z.object({ clientId: z.string().uuid() });
const noteParamsSchema = clientParamsSchema.extend({ noteId: z.string().uuid() });
const rangeQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  timeZone: z.string().min(1).optional(),
});
const measurementsQuerySchema = z.object({
  metric: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().max(100).optional(),
});
const planSchema = z.object({
  dailyCalories: z.number().positive(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  /** Omitted → unchanged; null → back to automatic. */
  waterTargetMl: z.number().int().nullable().optional(),
  stepTarget: z.number().int().nullable().optional(),
});
const analyticsQuerySchema = z.object({
  period: z.enum(['14', '30', 'all']).default('14'),
  timeZone: z.string().min(1).optional(),
});
const alertRulesSchema = z.object({
  rules: z
    .array(z.object({ ruleId: z.string().min(1).max(40), enabled: z.boolean(), threshold: z.number().nullable() }))
    .min(1)
    .max(50),
});
const noteSchema = z.object({ body: z.string().trim().min(1).max(5000) });
const assigneeSchema = z.object({ dietitianId: z.string().uuid() });
const accessLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});

function parseOrThrow<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

/** Default range is the caller's "today"; `from` alone means from..today. */
function resolveRange(query: z.output<typeof rangeQuerySchema>): { from: Date; to: Date } {
  const today = resolveUserToday({ timeZone: query.timeZone });
  const to = query.to ? new Date(`${query.to}T00:00:00.000Z`) : today;
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : to;
  if (from > to) {
    throw new ValidationError('INVALID_DATE_RANGE', 'from must not be after to');
  }
  return { from, to };
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

export interface PracticeUseCases {
  getPracticeMe: GetPracticeMe;
  activateDietitian: ActivateDietitian;
  updateDietitianProfile: UpdateDietitianProfile;
  createInviteCode: CreateInviteCode;
  rotateInviteKey: RotateInviteKey;
  previewInvite: PreviewInvite;
  joinDietitian: JoinDietitian;
  getMyLink: GetMyLink;
  updateConsent: UpdateConsent;
  endLink: EndLink;
  getMyAccessLog: GetMyAccessLog;
  listClients: ListClients;
  getClientOverview: GetClientOverview;
  readClientData: ReadClientData;
  setClientPlan: SetClientPlan;
  clientNotes: ClientNotes;
  listOrganizationMembers: ListOrganizationMembers;
  reassignClient: ReassignClient;
  getClientAnalytics: GetClientAnalytics;
  alertRuleSettings: AlertRuleSettings;
}

export class PracticeController {
  constructor(
    private readonly useCases: PracticeUseCases,
    private readonly rateLimit: (key: string) => Promise<void>,
  ) {}

  // ─── shared ────────────────────────────────────────────────────────────
  handleGetMe = handle(async (req, res) => {
    res.status(200).json(await this.useCases.getPracticeMe.execute(req.auth!.userId));
  });

  // ─── dietitian account ─────────────────────────────────────────────────
  handleActivate = handle(async (req, res) => {
    const { code } = parseOrThrow(codeSchema, req.body);
    await this.rateLimit(`practice-activate:${req.auth!.userId}`);
    res.status(201).json(await this.useCases.activateDietitian.execute({ userId: req.auth!.userId, code }));
  });

  handleUpdateProfile = handle(async (req, res) => {
    const patch = parseOrThrow(profileSchema, req.body);
    res.status(200).json(await this.useCases.updateDietitianProfile.execute(req.auth!.userId, patch));
  });

  handleCreateInvite = handle(async (req, res) => {
    const input = parseOrThrow(createInviteSchema, req.body ?? {});
    res.status(201).json(await this.useCases.createInviteCode.execute({ dietitianId: req.auth!.userId, ...input }));
  });

  handleRotateInviteKey = handle(async (req, res) => {
    const { organizationId } = parseOrThrow(orgQuerySchema, req.body ?? {});
    await this.useCases.rotateInviteKey.execute(req.auth!.userId, organizationId);
    res.status(204).end();
  });

  handleListMembers = handle(async (req, res) => {
    const { organizationId } = parseOrThrow(z.object({ organizationId: z.string().uuid() }), req.params);
    res.status(200).json({ items: await this.useCases.listOrganizationMembers.execute(req.auth!.userId, organizationId) });
  });

  // ─── client side ───────────────────────────────────────────────────────
  handlePreviewInvite = handle(async (req, res) => {
    const { code } = parseOrThrow(codeSchema, req.body);
    await this.rateLimit(`practice-join:${req.auth!.userId}`);
    res.status(200).json(await this.useCases.previewInvite.execute(code));
  });

  handleJoin = handle(async (req, res) => {
    const input = parseOrThrow(joinSchema, req.body);
    await this.rateLimit(`practice-join:${req.auth!.userId}`);
    res.status(201).json(await this.useCases.joinDietitian.execute({ clientId: req.auth!.userId, ...input }));
  });

  handleGetMyLink = handle(async (req, res) => {
    res.status(200).json(await this.useCases.getMyLink.execute(req.auth!.userId));
  });

  handleUpdateConsent = handle(async (req, res) => {
    const { consentScopes } = parseOrThrow(consentSchema, req.body);
    res.status(200).json(await this.useCases.updateConsent.execute(req.auth!.userId, consentScopes));
  });

  handleEndMyLink = handle(async (req, res) => {
    res.status(200).json(await this.useCases.endLink.byClient(req.auth!.userId));
  });

  handleGetAccessLog = handle(async (req, res) => {
    const query = parseOrThrow(accessLogQuerySchema, req.query);
    res.status(200).json(
      await this.useCases.getMyAccessLog.execute(req.auth!.userId, {
        limit: query.limit,
        before: query.before ? new Date(query.before) : undefined,
      }),
    );
  });

  // ─── dietitian → clients ───────────────────────────────────────────────
  handleListClients = handle(async (req, res) => {
    const query = parseOrThrow(listClientsSchema, req.query);
    const items = await this.useCases.listClients.execute({
      actorId: req.auth!.userId,
      view: query.view,
      organizationId: query.organizationId,
      query: query.q,
      today: resolveUserToday({ timeZone: query.timeZone }),
    });
    res.status(200).json({ items });
  });

  handleGetClient = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { timeZone } = parseOrThrow(z.object({ timeZone: z.string().min(1).optional() }), req.query);
    res
      .status(200)
      .json(await this.useCases.getClientOverview.execute(req.auth!.userId, clientId, resolveUserToday({ timeZone })));
  });

  handleGetClientMeals = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { from, to } = resolveRange(parseOrThrow(rangeQuerySchema, req.query));
    res.status(200).json({ items: await this.useCases.readClientData.getDays(req.auth!.userId, clientId, from, to) });
  });

  handleGetClientMeasurements = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const query = parseOrThrow(measurementsQuerySchema, req.query);
    res
      .status(200)
      .json({ items: await this.useCases.readClientData.listBodyMeasurements(req.auth!.userId, clientId, query) });
  });

  handleGetClientWater = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { from, to } = resolveRange(parseOrThrow(rangeQuerySchema, req.query));
    res.status(200).json({ items: await this.useCases.readClientData.getWater(req.auth!.userId, clientId, from, to) });
  });

  handleGetClientSteps = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { from, to } = resolveRange(parseOrThrow(rangeQuerySchema, req.query));
    res.status(200).json({ items: await this.useCases.readClientData.getSteps(req.auth!.userId, clientId, from, to) });
  });

  handleGetClientAnalytics = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const query = parseOrThrow(analyticsQuerySchema, req.query);
    const period = query.period === 'all' ? 'all' : (Number(query.period) as 14 | 30);
    res
      .status(200)
      .json(
        await this.useCases.getClientAnalytics.execute(
          req.auth!.userId,
          clientId,
          period,
          resolveUserToday({ timeZone: query.timeZone }),
        ),
      );
  });

  handleListAlertRules = handle(async (req, res) => {
    res.status(200).json({ items: await this.useCases.alertRuleSettings.list(req.auth!.userId) });
  });

  handleUpdateAlertRules = handle(async (req, res) => {
    const { rules } = parseOrThrow(alertRulesSchema, req.body);
    res.status(200).json({ items: await this.useCases.alertRuleSettings.update(req.auth!.userId, rules) });
  });

  handleSetClientPlan = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const targets = parseOrThrow(planSchema, req.body);
    res
      .status(200)
      .json(await this.useCases.setClientPlan.execute({ dietitianId: req.auth!.userId, clientId, ...targets }));
  });

  handleEndClientLink = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    res.status(200).json(await this.useCases.endLink.byStaff(req.auth!.userId, clientId));
  });

  handleReassign = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { dietitianId } = parseOrThrow(assigneeSchema, req.body);
    res.status(200).json(await this.useCases.reassignClient.execute(req.auth!.userId, clientId, dietitianId));
  });

  handleListNotes = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    res.status(200).json({ items: await this.useCases.clientNotes.list(req.auth!.userId, clientId) });
  });

  handleCreateNote = handle(async (req, res) => {
    const { clientId } = parseOrThrow(clientParamsSchema, req.params);
    const { body } = parseOrThrow(noteSchema, req.body);
    res.status(201).json(await this.useCases.clientNotes.create(req.auth!.userId, clientId, body));
  });

  handleUpdateNote = handle(async (req, res) => {
    const { clientId, noteId } = parseOrThrow(noteParamsSchema, req.params);
    const { body } = parseOrThrow(noteSchema, req.body);
    res.status(200).json(await this.useCases.clientNotes.update(req.auth!.userId, clientId, noteId, body));
  });

  handleDeleteNote = handle(async (req, res) => {
    const { clientId, noteId } = parseOrThrow(noteParamsSchema, req.params);
    await this.useCases.clientNotes.remove(req.auth!.userId, clientId, noteId);
    res.status(204).end();
  });
}
