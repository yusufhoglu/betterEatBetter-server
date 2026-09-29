import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { AdminAccessPolicy } from '../use-cases/AdminAccessPolicy';
import type { AdminQueries } from '../use-cases/AdminQueries';
import type { ManageAccounts } from '../use-cases/ManageAccounts';
import type { ManageActivationCodes } from '../use-cases/ManageActivationCodes';
import type { ManageDietitians } from '../use-cases/ManageDietitians';
import type { ManageUsers } from '../use-cases/ManageUsers';

const userParams = z.object({ userId: z.string().uuid() });
const codeParams = z.object({ codeId: z.string().uuid() });
const listUsersQuery = z.object({
  q: z.string().max(100).optional(),
  filter: z.enum(['all', 'premium', 'suspended', 'dietitians', 'with_dietitian', 'without_dietitian']).default('all'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const searchQuery = z.object({ q: z.string().max(100).optional() });
const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
const suspendBody = z.object({ reason: z.string().trim().max(500).nullable().optional() });
const premiumBody = z.object({ grant: z.boolean() });
const reassignBody = z.object({ dietitianId: z.string().uuid() });
const passwordModeSchema = z.enum(['generate', 'set', 'google']);
const createUserBody = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(100),
  role: z.enum(['user', 'dietitian']).default('user'),
  passwordMode: passwordModeSchema.default('generate'),
  password: z.string().max(200).optional(),
  premium: z.boolean().default(false),
  dietitianTitle: z.string().trim().max(100).nullable().optional(),
  licenseNo: z.string().trim().max(50).nullable().optional(),
});
const resetPasswordBody = z.object({ passwordMode: passwordModeSchema.default('generate'), password: z.string().max(200).optional() });
const createCodeBody = z.object({
  maxUses: z.number().int().min(1).max(1000).default(1),
  validityDays: z.number().int().min(1).max(3650).nullable().default(30),
  note: z.string().trim().max(200).nullable().optional(),
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

export interface AdminUseCases {
  access: AdminAccessPolicy;
  queries: AdminQueries;
  users: ManageUsers;
  accounts: ManageAccounts;
  dietitians: ManageDietitians;
  codes: ManageActivationCodes;
}

export class AdminController {
  constructor(private readonly useCases: AdminUseCases) {}

  /** Guard for every /admin route after authMiddleware. */
  requireAdmin = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.useCases.access.assertAdmin(req.auth!.userId);
      next();
    } catch (err) {
      next(err);
    }
  };

  handleMe = handle(async (req, res) => {
    res.status(200).json({ isAdmin: true, userId: req.auth!.userId });
  });

  handleOverview = handle(async (_req, res) => {
    res.status(200).json(await this.useCases.queries.overview());
  });

  handleListUsers = handle(async (req, res) => {
    res.status(200).json(await this.useCases.queries.listUsers(parseOrThrow(listUsersQuery, req.query)));
  });

  handleGetUser = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    res.status(200).json(await this.useCases.queries.getUser(userId));
  });

  handleCreateUser = handle(async (req, res) => {
    const input = parseOrThrow(createUserBody, req.body ?? {});
    res.status(201).json(await this.useCases.accounts.create(req.auth!.userId, input));
  });

  handleResetPassword = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    const { passwordMode, password } = parseOrThrow(resetPasswordBody, req.body ?? {});
    res.status(200).json(await this.useCases.accounts.resetPassword(req.auth!.userId, userId, passwordMode, password));
  });

  handleSuspendUser = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    const { reason } = parseOrThrow(suspendBody, req.body ?? {});
    await this.useCases.users.suspend(req.auth!.userId, userId, reason ?? null);
    res.status(204).end();
  });

  handleUnsuspendUser = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    await this.useCases.users.unsuspend(req.auth!.userId, userId);
    res.status(204).end();
  });

  handleSetPremium = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    const { grant } = parseOrThrow(premiumBody, req.body);
    await this.useCases.users.setPremium(req.auth!.userId, userId, grant);
    res.status(204).end();
  });

  handleListDietitians = handle(async (req, res) => {
    const { q } = parseOrThrow(searchQuery, req.query);
    res.status(200).json({ items: await this.useCases.queries.listDietitians(q) });
  });

  handleGetDietitian = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    res.status(200).json(await this.useCases.queries.getDietitian(userId));
  });

  handleSuspendDietitian = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    await this.useCases.dietitians.setSuspended(req.auth!.userId, userId, true);
    res.status(204).end();
  });

  handleUnsuspendDietitian = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    await this.useCases.dietitians.setSuspended(req.auth!.userId, userId, false);
    res.status(204).end();
  });

  handleReassignClient = handle(async (req, res) => {
    const { userId } = parseOrThrow(userParams, req.params);
    const { dietitianId } = parseOrThrow(reassignBody, req.body);
    await this.useCases.dietitians.reassign(req.auth!.userId, userId, dietitianId);
    res.status(204).end();
  });

  handleListCodes = handle(async (_req, res) => {
    res.status(200).json({ items: await this.useCases.queries.listActivationCodes() });
  });

  handleCreateCode = handle(async (req, res) => {
    const input = parseOrThrow(createCodeBody, req.body ?? {});
    res.status(201).json(await this.useCases.codes.create(req.auth!.userId, { ...input, note: input.note ?? null }));
  });

  handleRevokeCode = handle(async (req, res) => {
    const { codeId } = parseOrThrow(codeParams, req.params);
    await this.useCases.codes.revoke(req.auth!.userId, codeId);
    res.status(204).end();
  });

  handleAudit = handle(async (req, res) => {
    const { limit } = parseOrThrow(auditQuery, req.query);
    res.status(200).json({ items: await this.useCases.queries.listAudit(limit) });
  });
}
