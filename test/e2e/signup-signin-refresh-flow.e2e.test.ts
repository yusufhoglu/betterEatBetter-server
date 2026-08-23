import express from 'express';
import request from 'supertest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';

/**
 * E2E test: sign-up -> sign-in -> refresh -> reuse-rejected, against a real
 * Postgres (testcontainers) and the real production wiring (`identityRoutes()`
 * with PrismaUserRepository/PrismaRefreshTokenRepository/JwtSessionTokenAdapter
 * — no fakes). This is what distinguishes it from IdentityController.test.ts,
 * which already covers HTTP-level behavior against in-memory fakes.
 *
 * `identityRoutes()` (and the shared/persistence/db.ts client it wires
 * through PrismaUserRepository) is imported dynamically inside `beforeAll`,
 * after DATABASE_URL is pointed at the container — the shared PrismaClient
 * singleton is built once at first import, from process.env.DATABASE_URL, so
 * a static top-level import would bind to whatever DATABASE_URL jest.setup.ts
 * set (a non-existent default), not the container.
 *
 * Rate limiting is mocked out — it's exercised end-to-end in SignIn.test.ts
 * already, and pulling in a real Redis container here would just be a second,
 * unrelated infra dependency for a flow this test isn't about.
 */
jest.mock('../../src/shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
}));

describe('signup-signin-refresh-flow (E2E)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let app: express.Express;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { identityRoutes } = await import('../../src/modules/identity/http/identityRoutes');
    ({ prisma } = await import('../../src/shared/persistence/db'));

    app = express();
    app.use(express.json());
    app.use('/auth', identityRoutes());
    app.use(errorMapperMiddleware);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it('full flow: sign-up creates a session, sign-in returns a new one, refresh rotates it, and reusing the old token is rejected', async () => {
    const email = `rider-${Date.now()}@example.com`;
    const password = 'correctPassword1';

    const signUpRes = await request(app).post('/auth/sign-up').send({ email, password });
    expect(signUpRes.status).toBe(201);
    expect(signUpRes.body.userId).toBeTruthy();
    expect(signUpRes.body.accessToken).toBeTruthy();
    expect(signUpRes.body.refreshToken).toBeTruthy();
    expect(signUpRes.body).not.toHaveProperty('passwordHash');

    const signInRes = await request(app).post('/auth/sign-in').send({ email, password });
    expect(signInRes.status).toBe(200);
    expect(signInRes.body.userId).toBe(signUpRes.body.userId);

    const firstRefreshToken = signInRes.body.refreshToken as string;

    const refreshRes = await request(app).post('/auth/refresh').send({ refreshToken: firstRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.userId).toBe(signUpRes.body.userId);
    expect(refreshRes.body.refreshToken).not.toBe(firstRefreshToken);

    // Try reusing the already-rotated (now consumed) sign-in refresh token.
    const reuseRes = await request(app).post('/auth/refresh').send({ refreshToken: firstRefreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');

    // Reuse detection must revoke every active token for the user, including
    // the token that was just legitimately issued by the successful refresh.
    const rotatedTokenNowRejected = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(rotatedTokenNowRejected.status).toBe(401);
  });

  it('rejects sign-in with the wrong password using the same error as an unknown email', async () => {
    const email = `rider2-${Date.now()}@example.com`;
    await request(app).post('/auth/sign-up').send({ email, password: 'correctPassword1' });

    const wrongPasswordRes = await request(app).post('/auth/sign-in').send({ email, password: 'wrongPassword1' });
    const unknownEmailRes = await request(app)
      .post('/auth/sign-in')
      .send({ email: 'nobody@example.com', password: 'irrelevant1' });

    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.body).toEqual(unknownEmailRes.body);
  });

  it('rejects duplicate sign-up for the same email', async () => {
    const email = `rider3-${Date.now()}@example.com`;
    await request(app).post('/auth/sign-up').send({ email, password: 'correctPassword1' });

    const res = await request(app).post('/auth/sign-up').send({ email, password: 'anotherPassword1' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});
