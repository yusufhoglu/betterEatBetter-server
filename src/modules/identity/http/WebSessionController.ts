import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../../shared/config/env';
import { UnauthorizedError } from '../../../shared/errors/UnauthorizedError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { Logout } from '../use-cases/Logout';
import type { RefreshSession } from '../use-cases/RefreshSession';
import type { SignIn } from '../use-cases/SignIn';

/**
 * Browser sessions (dietitian web panel). Same use-cases as the app's
 * /auth/sign-in|refresh|logout, but the refresh token NEVER reaches
 * JavaScript: it lives in an httpOnly cookie scoped to /auth/web, and only
 * the short-lived access token is returned in the body (kept in memory).
 *
 * CSRF: the cookie is SameSite (strict by default) AND every call must carry
 * `X-Requested-With: eatbetter-web` — a custom header forces a CORS
 * preflight, which only WEB_PANEL_ORIGINS pass.
 */

export const WEB_REFRESH_COOKIE = 'eb_rt';
const COOKIE_PATH = '/auth/web';
export const WEB_CSRF_HEADER = 'x-requested-with';
export const WEB_CSRF_VALUE = 'eatbetter-web';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

function cookieAttributes(maxAgeSeconds: number): string {
  const sameSite = env.WEB_SESSION_COOKIE_SAMESITE;
  // SameSite=None requires Secure; plain http is only tolerated in development.
  const secure = sameSite === 'none' || env.NODE_ENV !== 'development';
  return [
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    secure ? 'Secure' : null,
    `SameSite=${sameSite[0]!.toUpperCase()}${sameSite.slice(1)}`,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  res.append('Set-Cookie', `${WEB_REFRESH_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(maxAge)}`);
}

function clearRefreshCookie(res: Response): void {
  res.append('Set-Cookie', `${WEB_REFRESH_COOKIE}=; ${cookieAttributes(0)}`);
}

function assertCsrfHeader(req: Request): void {
  if (req.header(WEB_CSRF_HEADER) !== WEB_CSRF_VALUE) {
    throw new UnauthorizedError('CSRF_HEADER_MISSING', 'Missing web client header');
  }
}

export class WebSessionController {
  constructor(
    private readonly signIn: SignIn,
    private readonly refreshSession: RefreshSession,
    private readonly logout: Logout,
  ) {}

  handleSignIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertCsrfHeader(req);
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('INVALID_REQUEST_BODY', parsed.error.issues[0]?.message ?? 'Invalid request');
      }
      const session = await this.signIn.execute(parsed.data);
      setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
      res.status(200).json({ userId: session.userId, accessToken: session.accessToken });
    } catch (err) {
      next(err);
    }
  };

  handleRefresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertCsrfHeader(req);
      const token = readCookie(req, WEB_REFRESH_COOKIE);
      if (!token) {
        throw new UnauthorizedError('NO_WEB_SESSION', 'No web session');
      }
      try {
        const session = await this.refreshSession.execute(token);
        setRefreshCookie(res, session.refreshToken, session.refreshTokenExpiresAt);
        res.status(200).json({ userId: session.userId, accessToken: session.accessToken });
      } catch (err) {
        clearRefreshCookie(res);
        throw err;
      }
    } catch (err) {
      next(err);
    }
  };

  handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertCsrfHeader(req);
      const token = readCookie(req, WEB_REFRESH_COOKIE);
      if (token) {
        await this.logout.execute(token).catch(() => undefined);
      }
      clearRefreshCookie(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
