import express from 'express';
import request from 'supertest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { config as loadDotEnv } from 'dotenv';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';

/**
 * End-to-end dietitian platform flow against a real Postgres (the
 * SMOKE_TEST_DATABASE_URL database, like all-endpoints.smoke.test.ts).
 * Redis-backed pieces are stubbed: the managed-client cache and realtime
 * publisher see an in-memory fake, queues and presigning are mocked.
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

describe('dietitian platform smoke', () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let signAccessToken: (userId: string) => string;
  let hashActivationCode: (code: string) => string;

  beforeAll(async () => {
    const envFile = loadDotEnv({ path: '.env' }).parsed;
    const databaseUrl = process.env.SMOKE_TEST_DATABASE_URL ?? envFile?.SMOKE_TEST_DATABASE_URL;
    if (!databaseUrl || !databaseUrl.includes('_smoke')) {
      throw new Error('SMOKE_TEST_DATABASE_URL must point to a dedicated *_smoke database');
    }
    process.env.DATABASE_URL = databaseUrl;
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });

    const [{ createRouter }, dbModule, authModule, activationModule] = await Promise.all([
      import('../../src/http/router'),
      import('../../src/shared/persistence/db'),
      import('../../src/shared/auth/jwt'),
      import('../../src/modules/practice/domain/activationCode'),
    ]);
    prisma = dbModule.prisma;
    signAccessToken = authModule.signAccessToken;
    hashActivationCode = activationModule.hashActivationCode;

    app = express();
    app.use(express.json());
    app.use(createRouter());
    app.use(errorMapperMiddleware);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createUser(name: string): Promise<{ id: string; auth: string }> {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@smoke.test`, name } });
    return { id: user.id, auth: `Bearer ${signAccessToken(user.id)}` };
  }

  async function issueCode(data: { organizationId?: string; orgRole?: string } = {}): Promise<string> {
    const code = `SMKE-${randomUUID().slice(0, 4).toUpperCase()}-TEST`;
    await prisma.dietitianActivationCode.create({ data: { codeHash: hashActivationCode(code), ...data } });
    return code;
  }

  it('runs activation → invite → join → data access → chat → plan → end', async () => {
    const dietitian = await createUser('Dyt. Ayşe Yılmaz');
    const client = await createUser('Mehmet Demir');
    const stranger = await createUser('Başka Diyetisyen');

    // client onboarded + some data
    expect(
      (
        await request(app).post('/onboarding/complete').set('Authorization', client.auth).send({
          weightKg: 82,
          targetWeightKg: 75,
          heightCm: 178,
          age: 31,
          gender: 'male',
          workoutsPerWeek: 3,
          goal: 'lose',
          weeklyPaceKg: 0.5,
        })
      ).status,
    ).toBe(201);
    await prisma.mealItem.create({
      data: {
        userId: client.id,
        date: new Date('2026-09-26T00:00:00.000Z'),
        mealType: 'lunch',
        entries: [{ id: randomUUID(), name: 'Mercimek çorbası', portionGrams: 250, calories: 180, proteinG: 9, carbsG: 25, fatG: 5 }],
      },
    });
    await prisma.bodyMeasurement.create({
      data: { userId: client.id, metric: 'weight', value: 81.2, unit: 'kg', date: new Date(), source: 'manual' },
    });

    // 1. activation
    const bad = await request(app).post('/practice/dietitian/activate').set('Authorization', dietitian.auth).send({ code: 'NOPE-NOPE' });
    expect(bad.status).toBe(404);
    const code = await issueCode();
    const activated = await request(app).post('/practice/dietitian/activate').set('Authorization', dietitian.auth).send({ code });
    expect(activated.status).toBe(201);
    expect(activated.body.membership).toMatchObject({ role: 'owner', organization: { kind: 'solo', name: 'Dyt. Ayşe Yılmaz' } });
    expect(activated.body.membership.inviteKey).toBeDefined();
    const reused = await request(app).post('/practice/dietitian/activate').set('Authorization', client.auth).send({ code });
    expect(reused.body.code).toBe('ACTIVATION_CODE_INVALID');

    const me = await request(app).get('/practice/me').set('Authorization', dietitian.auth);
    expect(me.body.dietitian.memberships).toHaveLength(1);

    // 2. invite + join
    const invite = await request(app).post('/practice/invites').set('Authorization', dietitian.auth).send({ validityDays: 3 });
    expect(invite.status).toBe(201);
    const preview = await request(app).post('/practice/invites/preview').set('Authorization', client.auth).send({ code: invite.body.code });
    expect(preview.body.dietitian.name).toBe('Dyt. Ayşe Yılmaz');

    const joined = await request(app)
      .post('/practice/join')
      .set('Authorization', client.auth)
      .send({ code: invite.body.code.toLowerCase(), consentScopes: ['meals', 'body_measurements'] });
    expect(joined.status).toBe(201);
    expect(joined.body.threadId).toBeTruthy();
    const again = await request(app).post('/practice/join').set('Authorization', client.auth).send({ code: invite.body.code, consentScopes: [] });
    expect(again.body.code).toBe('CLIENT_ALREADY_LINKED');

    // AI coach is now locked for the client
    const coach = await request(app).get('/dietician/conversations').set('Authorization', client.auth);
    expect(coach.status).toBe(403);
    expect(coach.body.code).toBe('AI_COACH_UNAVAILABLE_MANAGED_CLIENT');

    // …until the dietitian opens their AI assistant
    const aiDefaults = await request(app).get('/practice/ai/settings').set('Authorization', dietitian.auth);
    expect(aiDefaults.body).toMatchObject({ enabled: false, exampleCount: 0 });
    const aiSaved = await request(app)
      .put('/practice/ai/settings')
      .set('Authorization', dietitian.auth)
      .send({
        enabled: true,
        defaultClientAccess: true,
        assistantName: null,
        addressForm: 'siz',
        tone: 'Sıcak ve kısa.',
        approach: null,
        rules: ['Her cevapta bir öneri ver.'],
        avoid: [],
        handoffMessage: null,
        schedule: null,
      });
    expect(aiSaved.status).toBe(200);
    expect(aiSaved.body).toMatchObject({ enabled: true, availableNow: true, displayName: 'Dyt. Ayşe Yılmaz · AI asistan' });
    const example = await request(app)
      .post('/practice/ai/examples')
      .set('Authorization', dietitian.auth)
      .send({ question: 'Akşam meyve yiyebilir miyim?', answer: 'Evet, bir porsiyon olur.' });
    expect(example.status).toBe(201);
    expect(example.body.source).toBe('manual');

    const coachOpen = await request(app).get('/dietician/conversations').set('Authorization', client.auth);
    expect(coachOpen.status).toBe(200);
    const myLink = await request(app).get('/practice/me/link').set('Authorization', client.auth);
    expect(myLink.body.aiAssistant).toMatchObject({ enabled: true, availableNow: true });

    const clientAi = await request(app)
      .put(`/practice/clients/${client.id}/ai`)
      .set('Authorization', dietitian.auth)
      .send({ access: 'off', instructions: 'Laktoz intoleransı var.' });
    expect(clientAi.body).toMatchObject({ access: 'off', enabled: false });
    const coachOff = await request(app).get('/dietician/conversations').set('Authorization', client.auth);
    expect(coachOff.body.code).toBe('AI_COACH_UNAVAILABLE_MANAGED_CLIENT');
    await request(app)
      .put(`/practice/clients/${client.id}/ai`)
      .set('Authorization', dietitian.auth)
      .send({ access: null, instructions: 'Laktoz intoleransı var.' });

    // reviewing the client's AI chats needs their ai_chat consent
    const aiChats = await request(app).get(`/practice/clients/${client.id}/ai/conversations`).set('Authorization', dietitian.auth);
    expect(aiChats.body.code).toBe('CONSENT_SCOPE_DISABLED');

    // 3. roster & data access
    const roster = await request(app).get('/practice/clients?timeZone=UTC').set('Authorization', dietitian.auth);
    expect(roster.status).toBe(200);
    expect(roster.body.items[0]).toMatchObject({
      client: { userId: client.id, name: 'Mehmet Demir' },
      activity: { lastLoggedDate: '2026-09-26', latestWeightKg: 81.2 },
    });

    const meals = await request(app)
      .get(`/practice/clients/${client.id}/meals?from=2026-09-25&to=2026-09-26`)
      .set('Authorization', dietitian.auth);
    expect(meals.status).toBe(200);
    expect(meals.body.items[0]).toMatchObject({ date: '2026-09-26', meals: [{ mealType: 'lunch', photoUrls: [] }] });

    const water = await request(app).get(`/practice/clients/${client.id}/water`).set('Authorization', dietitian.auth);
    expect(water.body.code).toBe('CONSENT_SCOPE_DISABLED');

    const strangerRead = await request(app).get(`/practice/clients/${client.id}`).set('Authorization', stranger.auth);
    expect(strangerRead.status).toBe(404);

    const consent = await request(app)
      .patch('/practice/me/link/consent')
      .set('Authorization', client.auth)
      .send({ consentScopes: ['body_measurements'] });
    expect(consent.body.consentScopes).toEqual(['body_measurements']);
    const mealsAfter = await request(app).get(`/practice/clients/${client.id}/meals`).set('Authorization', dietitian.auth);
    expect(mealsAfter.status).toBe(403);

    // the audit log settles asynchronously
    await new Promise((resolve) => setTimeout(resolve, 200));
    const log = await request(app).get('/practice/me/access-log').set('Authorization', client.auth);
    expect(log.body.items.map((e: { scope: string }) => e.scope)).toEqual(expect.arrayContaining(['meals', 'summary']));

    // 4. chat
    const threadId = joined.body.threadId as string;
    const sent = await request(app)
      .post(`/threads/${threadId}/messages`)
      .set('Authorization', client.auth)
      .send({ clientMessageId: 'm-1', body: 'Merhaba hocam' });
    expect(sent.status).toBe(201);
    const retried = await request(app)
      .post(`/threads/${threadId}/messages`)
      .set('Authorization', client.auth)
      .send({ clientMessageId: 'm-1', body: 'Merhaba hocam' });
    expect(retried.status).toBe(200);
    expect(retried.body.id).toBe(sent.body.id);

    const threads = await request(app).get('/threads').set('Authorization', dietitian.auth);
    expect(threads.body.items[0]).toMatchObject({ id: threadId, unreadCount: 1, counterparts: [{ userId: client.id }] });
    await request(app).post(`/threads/${threadId}/read`).set('Authorization', dietitian.auth).send({ messageId: sent.body.id });
    expect((await request(app).get('/threads').set('Authorization', dietitian.auth)).body.items[0].unreadCount).toBe(0);
    expect((await request(app).get(`/threads/${threadId}/messages`).set('Authorization', stranger.auth)).status).toBe(404);

    // 5. plan takeover
    const plan = await request(app)
      .put(`/practice/clients/${client.id}/plan`)
      .set('Authorization', dietitian.auth)
      .send({ dailyCalories: 1800, proteinG: 130, carbsG: 170, fatG: 65 });
    expect(plan.status).toBe(200);
    expect(plan.body).toMatchObject({ source: 'dietitian', setByDietitianId: dietitian.id });
    const clientEdit = await request(app)
      .patch('/goal')
      .set('Authorization', client.auth)
      .send({ dailyCalories: 2500, proteinG: 150, carbsG: 300, fatG: 80 });
    expect(clientEdit.body.code).toBe('PLAN_MANAGED_BY_DIETITIAN');

    // 6. notes
    const note = await request(app)
      .post(`/practice/clients/${client.id}/notes`)
      .set('Authorization', dietitian.auth)
      .send({ body: 'Laktoz hassasiyeti' });
    expect(note.status).toBe(201);
    expect((await request(app).get(`/practice/clients/${client.id}/notes`).set('Authorization', dietitian.auth)).body.items).toHaveLength(1);

    // 7. client ends the relationship
    const ended = await request(app).post('/practice/me/link/end').set('Authorization', client.auth);
    expect(ended.body.status).toBe('ended');
    const readOnly = await request(app)
      .post(`/threads/${threadId}/messages`)
      .set('Authorization', client.auth)
      .send({ clientMessageId: 'm-2', body: 'son' });
    expect(readOnly.body.code).toBe('THREAD_READ_ONLY');
    const history = await request(app).get(`/threads/${threadId}/messages`).set('Authorization', dietitian.auth);
    expect(history.body.readOnly).toBe(true);
    expect(history.body.items.map((m: { type: string }) => m.type)).toEqual(['system', 'system', 'text']);
    const released = await prisma.plan.findUnique({ where: { userId: client.id } });
    expect(released).toMatchObject({ source: 'self', dailyCalories: 1800 });
    expect((await request(app).get('/dietician/conversations').set('Authorization', client.auth)).status).not.toBe(403);
  }, 60_000);

  it('clinic owner sees the roster, reassigns, but cannot read data', async () => {
    const owner = await createUser('Klinik Sahibi');
    const dytA = await createUser('Dyt. A');
    const dytB = await createUser('Dyt. B');
    const client = await createUser('Danışan');

    await request(app).post('/practice/dietitian/activate').set('Authorization', owner.auth).send({ code: await issueCode() });
    const orgId = (await request(app).get('/practice/me').set('Authorization', owner.auth)).body.dietitian.memberships[0].organizationId;
    for (const dyt of [dytA, dytB]) {
      const res = await request(app)
        .post('/practice/dietitian/activate')
        .set('Authorization', dyt.auth)
        .send({ code: await issueCode({ organizationId: orgId, orgRole: 'dietitian' }) });
      expect(res.status).toBe(201);
    }

    const invite = await request(app).post('/practice/invites').set('Authorization', dytA.auth).send({});
    const joined = await request(app)
      .post('/practice/join')
      .set('Authorization', client.auth)
      .send({ code: invite.body.code, consentScopes: ['meals'] });
    expect(joined.status).toBe(201);

    const members = await request(app).get(`/practice/organizations/${orgId}/members`).set('Authorization', owner.auth);
    expect(members.body.items).toHaveLength(3);
    expect(members.body.items[0].inviteKey).toBeUndefined();

    const roster = await request(app).get(`/practice/clients?view=organization&organizationId=${orgId}`).set('Authorization', owner.auth);
    expect(roster.body.items).toHaveLength(1);
    expect(roster.body.items[0].activity).toBeNull();
    expect((await request(app).get(`/practice/clients/${client.id}/meals`).set('Authorization', owner.auth)).status).toBe(403);
    expect(
      (await request(app).get(`/practice/clients?view=organization&organizationId=${orgId}`).set('Authorization', dytB.auth)).status,
    ).toBe(403);

    const reassigned = await request(app)
      .patch(`/practice/clients/${client.id}/assignee`)
      .set('Authorization', owner.auth)
      .send({ dietitianId: dytB.id });
    expect(reassigned.body.dietitianId).toBe(dytB.id);
    expect((await request(app).get(`/practice/clients/${client.id}/meals`).set('Authorization', dytB.auth)).status).toBe(200);
    expect((await request(app).get(`/practice/clients/${client.id}/meals`).set('Authorization', dytA.auth)).status).toBe(404);
    const thread = await request(app).get(`/threads/${joined.body.threadId}/messages`).set('Authorization', dytB.auth);
    expect(thread.status).toBe(200);
  }, 60_000);

  it('steps, activity targets, analytics and alert rules', async () => {
    const dietitian = await createUser('Dyt. Analitik');
    const client = await createUser('Adımcı Danışan');
    await request(app).post('/onboarding/complete').set('Authorization', client.auth).send({
      weightKg: 64.8,
      targetWeightKg: 60,
      heightCm: 168,
      age: 34,
      gender: 'female',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });

    const goalBefore = await request(app).get('/goal').set('Authorization', client.auth);
    expect(goalBefore.body).toMatchObject({ waterTargetMl: 2100, stepTarget: 8000, waterTargetAuto: true, stepTargetAuto: true });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const synced = await request(app)
      .put('/activity/steps')
      .set('Authorization', client.auth)
      .send({ timeZone: 'UTC', source: 'apple_health', days: [{ date: yesterday, steps: 9100 }, { date: today, steps: 2300 }] });
    expect(synced.body).toEqual({ saved: 2 });
    expect((await request(app).get(`/activity/steps?timeZone=UTC&from=${yesterday}`).set('Authorization', client.auth)).body.items).toHaveLength(2);

    await request(app).post('/practice/dietitian/activate').set('Authorization', dietitian.auth).send({ code: await issueCode() });
    const invite = await request(app).post('/practice/invites').set('Authorization', dietitian.auth).send({});
    await request(app)
      .post('/practice/join')
      .set('Authorization', client.auth)
      .send({ code: invite.body.code, consentScopes: ['meals', 'water', 'steps', 'body_measurements'] });

    const plan = await request(app)
      .put(`/practice/clients/${client.id}/plan`)
      .set('Authorization', dietitian.auth)
      .send({ dailyCalories: 1800, proteinG: 120, carbsG: 180, fatG: 66, stepTarget: 10000 });
    expect(plan.body).toMatchObject({ stepTarget: 10000, waterTargetMl: null });
    const goalAfter = await request(app).get('/goal').set('Authorization', client.auth);
    expect(goalAfter.body).toMatchObject({ stepTarget: 10000, stepTargetAuto: false, waterTargetAuto: true, planSource: 'dietitian' });

    const steps = await request(app).get(`/practice/clients/${client.id}/steps?from=${yesterday}&timeZone=UTC`).set('Authorization', dietitian.auth);
    expect(steps.body.items).toEqual([{ date: yesterday, steps: 9100 }, { date: today, steps: 2300 }]);

    // Pretend the relationship started 20 days ago so time-based rules can fire.
    await prisma.dietitianClientLink.updateMany({
      where: { clientId: client.id, status: 'active' },
      data: { startedAt: new Date(Date.now() - 20 * 86_400_000) },
    });

    const analytics = await request(app).get(`/practice/clients/${client.id}/analytics?period=14&timeZone=UTC`).set('Authorization', dietitian.auth);
    expect(analytics.status).toBe(200);
    expect(analytics.body.period.days).toBe(14);
    expect(analytics.body.targets).toMatchObject({ steps: 10000, stepsAuto: false, waterMl: 2100 });
    expect(analytics.body.days.find((d: { date: string }) => d.date === yesterday).steps).toBe(9100);
    expect(analytics.body.alerts.map((a: { ruleId: string }) => a.ruleId)).toEqual(expect.arrayContaining(['never_started', 'no_weighin']));
    expect(analytics.body.score.score).toEqual(expect.any(Number));

    const rules = await request(app).get('/practice/alert-rules').set('Authorization', dietitian.auth);
    expect(rules.body.items).toHaveLength(11);
    const updated = await request(app)
      .put('/practice/alert-rules')
      .set('Authorization', dietitian.auth)
      .send({ rules: [{ ruleId: 'no_weighin', enabled: false, threshold: null }] });
    expect(updated.body.items.find((r: { id: string }) => r.id === 'no_weighin').enabled).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const roster = await request(app).get('/practice/clients?timeZone=UTC').set('Authorization', dietitian.auth);
    expect(roster.body.items[0].insight).toMatchObject({ score: expect.any(Number) });
    expect(roster.body.items[0].insight.alerts.map((a: { ruleId: string }) => a.ruleId)).not.toContain('no_weighin');
  }, 60_000);
});
