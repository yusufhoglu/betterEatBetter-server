import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import type { DeleteAccount } from '../use-cases/DeleteAccount';
import type { Logout } from '../use-cases/Logout';
import type { RefreshSession } from '../use-cases/RefreshSession';
import type { SignIn } from '../use-cases/SignIn';
import type { SignInWithProvider } from '../use-cases/SignInWithProvider';
import type { SignUp } from '../use-cases/SignUp';

const logger = createModuleLogger('identity-controller');

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const socialSignInSchema = z.object({
  provider: z.string().min(1),
  idToken: z.string().min(1),
});

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('INVALID_REQUEST_BODY', result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}

/** /sign-up, /sign-in, /refresh — these sit outside authMiddleware, there is no token yet at this point. */
export class IdentityController {
  constructor(
    private readonly signUp: SignUp,
    private readonly signIn: SignIn,
    private readonly signInWithProvider: SignInWithProvider,
    private readonly refreshSession: RefreshSession,
    private readonly logout: Logout,
    private readonly deleteAccount: DeleteAccount,
  ) {}

  handleSignUp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info({ bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>) }, 'sign-up request received');
      const input = parseOrThrow(credentialsSchema, req.body);
      const session = await this.signUp.execute(input);
      logger.info({ userId: session.userId }, 'sign-up request succeeded');
      res.status(201).json(session);
    } catch (err) {
      logger.error({ err }, 'sign-up request failed');
      next(err);
    }
  };

  handleSignIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info({ bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>) }, 'sign-in request received');
      const input = parseOrThrow(credentialsSchema, req.body);
      const session = await this.signIn.execute(input);
      logger.info({ userId: session.userId }, 'sign-in request succeeded');
      res.status(200).json(session);
    } catch (err) {
      logger.error({ err }, 'sign-in request failed');
      next(err);
    }
  };

  handleSocialSignIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(socialSignInSchema, req.body);
      logger.info({ provider: input.provider }, 'social sign-in request received');
      const session = await this.signInWithProvider.execute(input);
      logger.info({ userId: session.userId, provider: input.provider }, 'social sign-in request succeeded');
      res.status(200).json(session);
    } catch (err) {
      logger.error({ err }, 'social sign-in request failed');
      next(err);
    }
  };

  handleRefresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info({ bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>) }, 'refresh request received');
      const { refreshToken } = parseOrThrow(refreshSchema, req.body);
      const session = await this.refreshSession.execute(refreshToken);
      logger.info({ userId: session.userId }, 'refresh request succeeded');
      res.status(200).json(session);
    } catch (err) {
      logger.error({ err }, 'refresh request failed');
      next(err);
    }
  };

  handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info({ bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>) }, 'logout request received');
      const { refreshToken } = parseOrThrow(refreshSchema, req.body);
      await this.logout.execute(refreshToken);
      logger.info({}, 'logout request succeeded');
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, 'logout request failed');
      next(err);
    }
  };

  handleDeleteAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deleteAccount.execute(req.auth!.userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
