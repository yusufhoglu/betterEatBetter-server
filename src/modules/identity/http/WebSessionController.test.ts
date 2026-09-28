import type { NextFunction, Request, Response } from 'express';
import { WebSessionController, WEB_CSRF_VALUE } from './WebSessionController';

function mockRes() {
  const res = {
    cookies: [] as string[],
    statusCode: 0,
    body: undefined as unknown,
    append(name: string, value: string) {
      if (name === 'Set-Cookie') this.cookies.push(value);
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send() {
      return this;
    },
  };
  return res;
}

function req(headers: Record<string, string>, body: unknown = {}): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { body, headers: lower, header: (n: string) => lower[n.toLowerCase()] } as unknown as Request;
}

const session = { userId: 'u1', accessToken: 'access', refreshToken: 'refresh-1', refreshTokenExpiresAt: new Date(Date.now() + 86_400_000) };

describe('WebSessionController', () => {
  const signIn = { execute: jest.fn().mockResolvedValue(session) };
  const refresh = { execute: jest.fn().mockResolvedValue({ ...session, refreshToken: 'refresh-2' }) };
  const logout = { execute: jest.fn().mockResolvedValue(undefined) };
  const google = { execute: jest.fn().mockResolvedValue({ ...session, refreshToken: 'refresh-g' }) };
  const controller = new WebSessionController(signIn as never, refresh as never, logout as never, google as never);

  it('signs in with a Google ID token into the same cookie session', async () => {
    const res = mockRes();
    await controller.handleGoogleSignIn(req({ 'X-Requested-With': WEB_CSRF_VALUE }, { idToken: 'google-id-token' }), res as unknown as Response, jest.fn());

    expect(google.execute).toHaveBeenCalledWith({ provider: 'google', idToken: 'google-id-token' });
    expect(res.body).toEqual({ userId: 'u1', accessToken: 'access' });
    expect(res.cookies[0]).toContain('eb_rt=refresh-g;');
  });

  it('keeps the refresh token out of the body and in an httpOnly cookie', async () => {
    const res = mockRes();
    await controller.handleSignIn(req({ 'X-Requested-With': WEB_CSRF_VALUE }, { email: 'a@b.co', password: 'x' }), res as unknown as Response, jest.fn());

    expect(res.body).toEqual({ userId: 'u1', accessToken: 'access' });
    expect(res.cookies[0]).toMatch(/^eb_rt=refresh-1; Path=\/auth\/web; HttpOnly; Secure; SameSite=Strict; Max-Age=\d+$/);
  });

  it('rotates via the cookie', async () => {
    const res = mockRes();
    await controller.handleRefresh(req({ 'X-Requested-With': WEB_CSRF_VALUE, cookie: 'other=1; eb_rt=refresh-1' }), res as unknown as Response, jest.fn());

    expect(refresh.execute).toHaveBeenCalledWith('refresh-1');
    expect(res.cookies[0]).toContain('eb_rt=refresh-2;');
  });

  it('rejects calls without the web header (CSRF)', async () => {
    const next = jest.fn() as NextFunction;
    await controller.handleRefresh(req({ cookie: 'eb_rt=refresh-1' }), mockRes() as unknown as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'CSRF_HEADER_MISSING' }));
  });

  it('logout clears the cookie', async () => {
    const res = mockRes();
    await controller.handleLogout(req({ 'X-Requested-With': WEB_CSRF_VALUE, cookie: 'eb_rt=refresh-2' }), res as unknown as Response, jest.fn());
    expect(logout.execute).toHaveBeenCalledWith('refresh-2');
    expect(res.cookies[0]).toContain('Max-Age=0');
  });
});
