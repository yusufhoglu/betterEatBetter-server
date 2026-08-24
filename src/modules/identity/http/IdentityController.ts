import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { DeleteAccount } from '../use-cases/DeleteAccount';
import type { Logout } from '../use-cases/Logout';
import type { RefreshSession } from '../use-cases/RefreshSession';
import type { SignIn } from '../use-cases/SignIn';
import type { SignUp } from '../use-cases/SignUp';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
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
    private readonly refreshSession: RefreshSession,
    private readonly logout: Logout,
    private readonly deleteAccount: DeleteAccount,
  ) {}

  handleSignUp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(credentialsSchema, req.body);
      const session = await this.signUp.execute(input);
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  };

  handleSignIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseOrThrow(credentialsSchema, req.body);
      const session = await this.signIn.execute(input);
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  };

  handleRefresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = parseOrThrow(refreshSchema, req.body);
      const session = await this.refreshSession.execute(refreshToken);
      res.status(200).json(session);
    } catch (err) {
      next(err);
    }
  };

  handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = parseOrThrow(refreshSchema, req.body);
      await this.logout.execute(refreshToken);
      res.status(204).send();
    } catch (err) {
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
