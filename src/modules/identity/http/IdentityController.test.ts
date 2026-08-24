import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import { DeleteAccount } from '../use-cases/DeleteAccount';
import { Logout } from '../use-cases/Logout';
import { RefreshSession } from '../use-cases/RefreshSession';
import { SignIn } from '../use-cases/SignIn';
import { SignUp } from '../use-cases/SignUp';
import { FakeSessionTokenPort } from '../test-utils/fakes/FakeSessionTokenPort';
import { InMemoryRefreshTokenRepository } from '../test-utils/fakes/InMemoryRefreshTokenRepository';
import { InMemoryUserRepository } from '../test-utils/fakes/InMemoryUserRepository';
import { IdentityController } from './IdentityController';

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
}));

// Identity controller tests exercise the real argon2-based password hashing
// path through SignUp, so they can exceed Jest's default 5-second timeout on
// slower Windows/debug runs.
jest.setTimeout(15000);

function buildApp() {
  const userRepository = new InMemoryUserRepository();
  const emailPasswordAdapter = new EmailPasswordAdapter(userRepository);
  const sessionTokenPort = new FakeSessionTokenPort();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();

  const signUp = new SignUp(userRepository, emailPasswordAdapter, sessionTokenPort, refreshTokenRepository);
  const signIn = new SignIn(emailPasswordAdapter, sessionTokenPort, refreshTokenRepository);
  const refreshSession = new RefreshSession(refreshTokenRepository, sessionTokenPort);
  const logout = new Logout(refreshTokenRepository);
  const deleteAccount = new DeleteAccount(userRepository, refreshTokenRepository);
  const controller = new IdentityController(signUp, signIn, refreshSession, logout, deleteAccount);
  const fakeAuthMiddleware: RequestHandler = (req, _res, next) => {
    req.auth = { userId: req.header('x-user-id') ?? '' };
    next();
  };

  const app = express();
  app.use(express.json());
  app.post('/sign-up', controller.handleSignUp);
  app.post('/sign-in', controller.handleSignIn);
  app.post('/refresh', controller.handleRefresh);
  app.post('/logout', controller.handleLogout);
  app.delete('/account', fakeAuthMiddleware, controller.handleDeleteAccount);
  app.use(errorMapperMiddleware);

  return app;
}

describe('IdentityController', () => {
  describe('POST /sign-up', () => {
    test('201s with a session and never leaks passwordHash in the response', async () => {
      const app = buildApp();

      const res = await request(app).post('/sign-up').send({ email: 'new@example.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ userId: expect.any(String), accessToken: expect.any(String) });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
    });

    test('409s with EMAIL_ALREADY_REGISTERED on duplicate sign-up', async () => {
      const app = buildApp();
      await request(app).post('/sign-up').send({ email: 'dup@example.com', password: 'password123' });

      const res = await request(app).post('/sign-up').send({ email: 'dup@example.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    test('400s with PASSWORD_TOO_WEAK for a short password', async () => {
      const app = buildApp();

      const res = await request(app).post('/sign-up').send({ email: 'weak@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });

    test('400s on a malformed body (invalid email)', async () => {
      const app = buildApp();

      const res = await request(app).post('/sign-up').send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST_BODY');
    });
  });

  describe('POST /sign-in', () => {
    test('200s with a session for correct credentials', async () => {
      const app = buildApp();
      await request(app).post('/sign-up').send({ email: 'rider@example.com', password: 'correctPassword1' });

      const res = await request(app)
        .post('/sign-in')
        .send({ email: 'rider@example.com', password: 'correctPassword1' });

      expect(res.status).toBe(200);
      expect(res.body.userId).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
    });

    test('401s with the same INVALID_CREDENTIALS body for an unknown email and for a wrong password', async () => {
      const app = buildApp();
      await request(app).post('/sign-up').send({ email: 'rider@example.com', password: 'correctPassword1' });

      const unknownEmailRes = await request(app)
        .post('/sign-in')
        .send({ email: 'nobody@example.com', password: 'irrelevant' });
      const wrongPasswordRes = await request(app)
        .post('/sign-in')
        .send({ email: 'rider@example.com', password: 'wrongPassword1' });

      expect(unknownEmailRes.status).toBe(401);
      expect(wrongPasswordRes.status).toBe(401);
      expect(unknownEmailRes.body).toEqual(wrongPasswordRes.body);
      expect(unknownEmailRes.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('POST /refresh', () => {
    test('200s with a rotated token pair for a valid refresh token', async () => {
      const app = buildApp();
      const signUpRes = await request(app)
        .post('/sign-up')
        .send({ email: 'rider@example.com', password: 'correctPassword1' });

      const res = await request(app).post('/refresh').send({ refreshToken: signUpRes.body.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(signUpRes.body.userId);
      expect(res.body.refreshToken).not.toBe(signUpRes.body.refreshToken);
    });

    test('401s and blocks a second use of an already-rotated refresh token (reuse detection)', async () => {
      const app = buildApp();
      const signUpRes = await request(app)
        .post('/sign-up')
        .send({ email: 'rider@example.com', password: 'correctPassword1' });

      await request(app).post('/refresh').send({ refreshToken: signUpRes.body.refreshToken });
      const reuseRes = await request(app).post('/refresh').send({ refreshToken: signUpRes.body.refreshToken });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    });

    test('400s on a missing refreshToken field', async () => {
      const app = buildApp();

      const res = await request(app).post('/refresh').send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_REQUEST_BODY');
    });
  });

  describe('POST /logout', () => {
    test('204s and revokes the presented refresh token', async () => {
      const app = buildApp();
      const signUpRes = await request(app)
        .post('/sign-up')
        .send({ email: 'logout@example.com', password: 'correctPassword1' });

      const logoutRes = await request(app).post('/logout').send({ refreshToken: signUpRes.body.refreshToken });
      const refreshRes = await request(app).post('/refresh').send({ refreshToken: signUpRes.body.refreshToken });

      expect(logoutRes.status).toBe(204);
      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
    });
  });

  describe('DELETE /account', () => {
    test('204s and removes the user account', async () => {
      const app = buildApp();
      const signUpRes = await request(app)
        .post('/sign-up')
        .send({ email: 'delete-me@example.com', password: 'correctPassword1' });

      const deleteRes = await request(app)
        .delete('/account')
        .set('x-user-id', signUpRes.body.userId);

      const signInRes = await request(app)
        .post('/sign-in')
        .send({ email: 'delete-me@example.com', password: 'correctPassword1' });

      expect(deleteRes.status).toBe(204);
      expect(signInRes.status).toBe(401);
      expect(signInRes.body.code).toBe('INVALID_CREDENTIALS');
    });
  });
});
