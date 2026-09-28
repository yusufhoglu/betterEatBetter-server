import express from 'express';
import request from 'supertest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { config as loadDotEnv } from 'dotenv';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';

/**
 * Platform admin flow against a real Postgres (SMOKE_TEST_DATABASE_URL), with
 * Redis/queues stubbed like dietitian-platform.smoke.test.ts.
 */

jest.mock('../../src/shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/shared/cache/redisCacheClient', () => {
  const store = new Map<string, string>();
  return {
    cacheRedisClient: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => void store.set(key, value)),
      del: jest.fn(async (key: string) => void store.delete(key)),
      publish: jest.fn().mockResolvedValue(0),
      on: jest.fn(),
    },
  };
});

jest.mock('../../src/shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'smoke-job-id' }) })),
  createWorker: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.com/presigned'),
}));

jest.mock('../../src/shared/llm/llmClientFactory', () => ({
  createLlmClient: jest.fn(() => ({})),
}));

const ADMIN_EMAIL = `admin-${randomUUID()}@smoke.test`;
// The smoke database is shared across runs: make searched names unique.
const RUN = randomUUID().slice(0, 6);

describe('platform admin smoke', () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let signAccessToken: (userId: string) => string;
  let recordUsage: (userId: string, feature: string, tokens: number) => Promise<void>;

  beforeAll(async () => {
    const envFile = loadDotEnv({ path: '.env' }).parsed;
    const databaseUrl = process.env.SMOKE_TEST_DATABASE_URL ?? envFile?.SMOKE_TEST_DATABASE_URL;
    if (!databaseUrl || !databaseUrl.includes('_smoke')) {
      throw new Error('SMOKE_TEST_DATABASE_URL must point to a dedicated *_smoke database');
    }
    process.env.DATABASE_URL = databaseUrl;
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });

    // env is parsed on first import (already done by the static imports above).
    const { env } = await import('../../src/shared/config/env');
    env.PLATFORM_ADMIN_EMAILS.splice(0, env.PLATFORM_ADMIN_EMAILS.length, ADMIN_EMAIL);

    const [{ createRouter }, dbModule, authModule, sinkModule, wiringModule, tracer] = await Promise.all([
      import('../../src/http/router'),
      import('../../src/shared/persistence/db'),
      import('../../src/shared/auth/jwt'),
      import('../../src/shared/llm/usageSink'),
      import('../../src/modules/admin/http/adminWiring'),
      import('../../src/shared/observability/tracer'),
    ]);
    prisma = dbModule.prisma;
    signAccessToken = authModule.signAccessToken;
    sinkModule.setLlmUsageSink(wiringModule.aiUsageRecorder.record);
    recordUsage = async (userId, feature, tokens) => {
      tracer.runWithContext({ traceId: randomUUID(), userId }, () =>
        sinkModule.emitLlmUsage({ provider: 'openai', feature, model: 'gpt-test', inputTokens: tokens, outputTokens: 10 }),
      );
      await wiringModule.aiUsageRecorder.flush();
    };

    app = express();
    app.use(express.json());
    app.use(createRouter());
    app.use(errorMapperMiddleware);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createUser(name: string, email = `${randomUUID()}@smoke.test`): Promise<{ id: string; auth: string; email: string }> {
    const user = await prisma.user.create({ data: { email, name } });
    return { id: user.id, auth: `Bearer ${signAccessToken(user.id)}`, email };
  }

  it('manages codes, dietitians, users, premium, suspension and usage', async () => {
    const admin = await createUser('Platform Admin', ADMIN_EMAIL);
    const outsider = await createUser('Not Admin');

    // access
    expect((await request(app).get('/admin/me').set('Authorization', outsider.auth)).body.code).toBe('NOT_PLATFORM_ADMIN');
    expect((await request(app).get('/admin/me')).status).toBe(401);
    expect((await request(app).get('/admin/me').set('Authorization', admin.auth)).body).toMatchObject({ isAdmin: true });

    // 1. activation codes: create → redeem → shows as used up with redeemer
    const created = await request(app)
      .post('/admin/activation-codes')
      .set('Authorization', admin.auth)
      .send({ maxUses: 1, validityDays: 30, note: 'Smoke Dyt A' });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const dytA = await createUser(`Dyt. Smoke A ${RUN}`);
    expect((await request(app).post('/practice/dietitian/activate').set('Authorization', dytA.auth).send({ code: created.body.code })).status).toBe(201);

    const codes = await request(app).get('/admin/activation-codes').set('Authorization', admin.auth);
    expect(codes.body.items.find((c: { id: string }) => c.id === created.body.id)).toMatchObject({
      status: 'used_up',
      usedCount: 1,
      note: 'Smoke Dyt A',
      redeemedBy: [{ userId: dytA.id, name: `Dyt. Smoke A ${RUN}` }],
    });
    const spare = await request(app).post('/admin/activation-codes').set('Authorization', admin.auth).send({ validityDays: null });
    expect(spare.body.expiresAt).toBeNull();
    expect((await request(app).post(`/admin/activation-codes/${spare.body.id}/revoke`).set('Authorization', admin.auth)).status).toBe(204);
    expect((await request(app).post(`/admin/activation-codes/${spare.body.id}/revoke`).set('Authorization', admin.auth)).status).toBe(404);
    const revoked = await request(app).post('/practice/dietitian/activate').set('Authorization', outsider.auth).send({ code: spare.body.code });
    expect(revoked.body.code).toBe('ACTIVATION_CODE_INVALID');

    // 2. a client joins dietitian A, uses AI and photo recognition
    const client = await createUser(`Smoke Danışan ${RUN}`);
    const invite = await request(app).post('/practice/invites').set('Authorization', dytA.auth).send({});
    expect(
      (await request(app).post('/practice/join').set('Authorization', client.auth).send({ code: invite.body.code, consentScopes: ['meals'] }))
        .status,
    ).toBe(201);
    await recordUsage(client.id, 'food-recognition-text', 90);
    await recordUsage(client.id, 'chatbot', 40);
    await prisma.foodEntry.createMany({
      data: [
        { id: randomUUID(), userId: client.id, status: 'completed' },
        { id: randomUUID(), userId: client.id, status: 'failed' },
      ],
    });

    const list = await request(app).get('/admin/users').query({ q: `smoke danışan ${RUN}`, filter: 'with_dietitian' }).set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      userId: client.id,
      isPremium: false,
      dietitian: { userId: dytA.id, name: `Dyt. Smoke A ${RUN}` },
      aiTokens30: 150,
      photoScans30: 2,
    });

    const detail = await request(app).get(`/admin/users/${client.id}`).set('Authorization', admin.auth);
    expect(detail.body.user.ai.byFeature).toEqual([
      { feature: 'food-recognition-text', calls: 1, inputTokens: 90, outputTokens: 10 },
      { feature: 'chatbot', calls: 1, inputTokens: 40, outputTokens: 10 },
    ]);
    expect(detail.body.user.photoScans).toEqual({ total30: 2, failed30: 1, allTime: 2 });
    expect(detail.body.user.ai.dailyTokens).toHaveLength(31);
    expect(detail.body.user.signInMethods).toEqual({ password: false, google: false });
    // summary only — no health data fields leak into the admin payload
    expect(JSON.stringify(detail.body)).not.toMatch(/calories|weightKg|entries/);

    // 3. premium grant / revoke
    expect((await request(app).put(`/admin/users/${client.id}/premium`).set('Authorization', admin.auth).send({ grant: true })).status).toBe(204);
    expect((await request(app).get('/subscription/entitlement').set('Authorization', client.auth)).body.isPremium).toBe(true);
    expect((await request(app).get(`/admin/users/${client.id}`).set('Authorization', admin.auth)).body.user.subscription).toMatchObject({
      isPremium: true,
      adminGranted: true,
    });
    await request(app).put(`/admin/users/${client.id}/premium`).set('Authorization', admin.auth).send({ grant: false });
    expect((await request(app).get('/subscription/entitlement').set('Authorization', client.auth)).body.isPremium).toBe(false);

    // 4. dietitian suspension cuts access, unsuspend restores it
    expect((await request(app).post(`/admin/dietitians/${dytA.id}/suspend`).set('Authorization', admin.auth)).status).toBe(204);
    expect((await request(app).get('/practice/me').set('Authorization', dytA.auth)).body.dietitian).toBeNull();
    expect((await request(app).get(`/practice/clients/${client.id}`).set('Authorization', dytA.auth)).status).toBe(404);
    const dytList = await request(app).get('/admin/dietitians').query({ q: `Smoke A ${RUN}` }).set('Authorization', admin.auth);
    expect(dytList.body.items[0]).toMatchObject({ userId: dytA.id, status: 'suspended', activeClients: 1, activationCodeNote: 'Smoke Dyt A' });
    await request(app).post(`/admin/dietitians/${dytA.id}/unsuspend`).set('Authorization', admin.auth);
    expect((await request(app).get(`/practice/clients/${client.id}`).set('Authorization', dytA.auth)).status).toBe(200);

    // 5. reassign the client to another solo dietitian (cross-organization)
    const code2 = await request(app).post('/admin/activation-codes').set('Authorization', admin.auth).send({ note: 'Smoke Dyt B' });
    const dytB = await createUser('Dyt. Smoke B');
    await request(app).post('/practice/dietitian/activate').set('Authorization', dytB.auth).send({ code: code2.body.code });
    const moved = await request(app).post(`/admin/users/${client.id}/reassign`).set('Authorization', admin.auth).send({ dietitianId: dytB.id });
    expect(moved.status).toBe(204);
    expect((await request(app).get(`/practice/clients/${client.id}`).set('Authorization', dytB.auth)).status).toBe(200);
    expect((await request(app).get(`/practice/clients/${client.id}`).set('Authorization', dytA.auth)).status).toBe(404);
    const dytBDetail = await request(app).get(`/admin/dietitians/${dytB.id}`).set('Authorization', admin.auth);
    expect(dytBDetail.body.dietitian.clients).toEqual([expect.objectContaining({ clientId: client.id, name: `Smoke Danışan ${RUN}` })]);
    const threads = await request(app).get('/threads').set('Authorization', client.auth);
    expect(threads.body.items[0].counterparts[0].userId).toBe(dytB.id);

    // 6. suspension blocks sign-in and refresh
    const email = `${randomUUID()}@smoke.test`;
    const signUp = await request(app).post('/auth/sign-up').send({ email, password: 'Sifre-1234!' });
    expect(signUp.status).toBe(201);
    const target = signUp.body.userId as string;
    expect((await request(app).post(`/admin/users/${admin.id}/suspend`).set('Authorization', admin.auth).send({})).body.code).toBe(
      'CANNOT_SUSPEND_SELF',
    );
    expect((await request(app).post(`/admin/users/${target}/suspend`).set('Authorization', admin.auth).send({ reason: 'spam' })).status).toBe(204);
    const signIn = await request(app).post('/auth/sign-in').send({ email, password: 'Sifre-1234!' });
    expect(signIn.status).toBe(403);
    expect(signIn.body.code).toBe('ACCOUNT_SUSPENDED');
    expect((await request(app).post('/auth/refresh').send({ refreshToken: signUp.body.refreshToken })).status).not.toBe(200);
    const suspendedList = await request(app).get('/admin/users').query({ filter: 'suspended', q: email }).set('Authorization', admin.auth);
    expect(suspendedList.body.items[0]).toMatchObject({ userId: target });
    await request(app).post(`/admin/users/${target}/unsuspend`).set('Authorization', admin.auth);
    expect((await request(app).post('/auth/sign-in').send({ email, password: 'Sifre-1234!' })).status).toBe(200);

    // 7. overview + audit trail
    const overview = await request(app).get('/admin/overview').set('Authorization', admin.auth);
    expect(overview.status).toBe(200);
    expect(overview.body.users.total).toBeGreaterThanOrEqual(6);
    expect(overview.body.dietitians.total).toBeGreaterThanOrEqual(2);
    expect(overview.body.ai.byFeature.map((f: { feature: string }) => f.feature)).toEqual(
      expect.arrayContaining(['food-recognition-text', 'chatbot']),
    );
    expect(overview.body.signupsDaily).toHaveLength(31);

    const audit = await request(app).get('/admin/audit').query({ limit: 50 }).set('Authorization', admin.auth);
    const actions = audit.body.items.filter((a: { admin: { userId: string } }) => a.admin?.userId === admin.id).map((a: { action: string }) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'code.create',
        'code.revoke',
        'premium.grant',
        'premium.revoke',
        'dietitian.suspend',
        'dietitian.unsuspend',
        'client.reassign',
        'user.suspend',
        'user.unsuspend',
      ]),
    );
    expect(JSON.stringify(audit.body)).not.toContain(created.body.code);
  }, 60_000);
});
