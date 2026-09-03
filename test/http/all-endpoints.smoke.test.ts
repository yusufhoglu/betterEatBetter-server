import express from 'express';
import request from 'supertest';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { config as loadDotEnv } from 'dotenv';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';

jest.mock('../../src/shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/modules/chatbot/rateLimiting/chatRateLimiter', () => ({
  chatRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../../src/shared/cache/redisCacheClient', () => ({
  cacheRedisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../src/shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'smoke-job-id' }) })),
  createWorker: jest.fn(),
}));

jest.mock('../../src/shared/storage/objectStorageClient', () => ({
  OBJECT_STORAGE_BUCKET: 'test-bucket',
  objectStorageClient: {
    send: jest.fn((cmd: unknown) => {
      const name = (cmd as { constructor: { name: string } }).constructor.name;
      if (name === 'HeadObjectCommand') {
        return Promise.resolve({ ContentLength: 512 * 1024 });
      }

      return Promise.resolve({
        Body: (async function* body() {
          yield Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
        })(),
      });
    }),
  },
}));

jest.mock('sharp', () =>
  jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 1200, height: 900 }),
  })),
);

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.com/presigned-upload'),
}));

jest.mock('../../src/modules/food-recognition/adapters/barcode/OpenFoodFactsAdapter', () => ({
  OpenFoodFactsAdapter: jest.fn().mockImplementation(() => ({
    lookup: jest.fn().mockResolvedValue({
      items: [
        {
          name: 'Greek Yogurt',
          source: 'barcode',
          portionGrams: 150,
          calories: 140,
          proteinG: 14,
          carbsG: 8,
          fatG: 4,
        },
      ],
      macros: { calories: 140, proteinG: 14, carbsG: 8, fatG: 4 },
    }),
  })),
}));

jest.mock('../../src/modules/food-recognition/adapters/barcode/RedisBarcodeCache', () => ({
  RedisBarcodeCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    setFound: jest.fn().mockResolvedValue(undefined),
    setNotFound: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../src/modules/food-recognition/adapters/text/LlmTextEstimator', () => ({
  LlmTextEstimator: jest.fn().mockImplementation(() => ({
    estimate: jest.fn().mockResolvedValue({
      status: 'completed',
      items: [
        {
          name: 'Chicken Salad',
          source: 'text',
          portionGrams: 250,
          calories: 360,
          proteinG: 32,
          carbsG: 18,
          fatG: 14,
        },
      ],
      macros: { calories: 360, proteinG: 32, carbsG: 18, fatG: 14 },
    }),
  })),
}));

jest.mock('../../src/shared/llm/llmClientFactory', () => ({
  createLlmClient: jest.fn(() => ({})),
}));

jest.mock('../../src/modules/chatbot/adapters/llm/SharedLlmChatAdapter', () => ({
  SharedLlmChatAdapter: jest.fn().mockImplementation(() => ({
    sendTurn: jest.fn().mockResolvedValue({ content: 'smoke-final', toolCalls: [] }),
    streamFinalReply: async function* streamFinalReply() {
      yield 'smoke-final';
    },
  })),
}));

jest.mock('../../src/modules/subscription/adapters/billing/AppleReceiptAdapter', () => ({
  AppleReceiptAdapter: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockImplementation(async (input: { productId: string; expiresAt?: Date | null }) => ({
      provider: 'apple',
      productId: input.productId,
      status: 'active',
      expiresAt: input.expiresAt ?? new Date('2026-12-31T00:00:00.000Z'),
    })),
  })),
}));

jest.mock('../../src/modules/subscription/adapters/billing/GoogleReceiptAdapter', () => ({
  GoogleReceiptAdapter: jest.fn().mockImplementation(() => ({
    validate: jest.fn().mockImplementation(async (input: { productId: string; expiresAt?: Date | null }) => ({
      provider: 'google',
      productId: input.productId,
      status: 'active',
      expiresAt: input.expiresAt ?? new Date('2026-12-31T00:00:00.000Z'),
    })),
  })),
}));

type Session = {
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
};

describe('all endpoint smoke tests', () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let signAccessToken: (userId: string) => string;

  beforeAll(async () => {
    const envFile = loadDotEnv({ path: '.env' }).parsed;
    const databaseUrl = process.env.SMOKE_TEST_DATABASE_URL ?? envFile?.SMOKE_TEST_DATABASE_URL;
    const primaryDatabaseUrl = process.env.DATABASE_URL ?? envFile?.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('SMOKE_TEST_DATABASE_URL must be set for HTTP smoke tests');
    }

    if (primaryDatabaseUrl && databaseUrl === primaryDatabaseUrl) {
      throw new Error('SMOKE_TEST_DATABASE_URL must not point to the primary DATABASE_URL');
    }

    if (!databaseUrl.includes('_smoke')) {
      throw new Error('SMOKE_TEST_DATABASE_URL must point to a dedicated smoke database');
    }

    process.env.DATABASE_URL = databaseUrl;

    execSync(process.platform === 'win32' ? 'npx.cmd prisma migrate deploy' : 'npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const [{ createRouter }, dbModule, authModule, tracingModule] = await Promise.all([
      import('../../src/http/router'),
      import('../../src/shared/persistence/db'),
      import('../../src/shared/auth/jwt'),
      import('../../src/shared/observability/tracingMiddleware'),
    ]);

    prisma = dbModule.prisma;
    signAccessToken = authModule.signAccessToken;

    app = express();
    app.use(express.json());
    app.use(tracingModule.tracingMiddleware);
    app.use(createRouter());
    app.use(errorMapperMiddleware);
  }, 120_000);

  afterEach(async () => {
    if (prisma) {
      await resetDatabase(prisma);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('identity smoke', () => {
    it('covers sign-up, sign-in, refresh, logout, and account deletion', async () => {
      const email = uniqueEmail('identity');
      const password = 'StrongPass123!';

      const signUpRes = await request(app).post('/auth/sign-up').send({ email, password });
      expect(signUpRes.status).toBe(201);
      expect(signUpRes.body.userId).toBeTruthy();
      expect(signUpRes.body.accessToken).toBeTruthy();
      expect(signUpRes.body.refreshToken).toBeTruthy();

      const signInRes = await request(app).post('/auth/sign-in').send({ email, password });
      expect(signInRes.status).toBe(200);
      expect(signInRes.body.userId).toBe(signUpRes.body.userId);

      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: signInRes.body.refreshToken });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.accessToken).toBeTruthy();

      const logoutRes = await request(app)
        .post('/auth/logout')
        .send({ refreshToken: refreshRes.body.refreshToken });
      expect(logoutRes.status).toBe(204);

      const deleteRes = await request(app)
        .delete('/auth/account')
        .set('Authorization', `Bearer ${signUpRes.body.accessToken}`);
      expect(deleteRes.status).toBe(204);
    });
  });

  describe('onboarding smoke', () => {
    it('covers POST /onboarding/complete', async () => {
      const session = await createSession();
      const res = await request(app)
        .post('/onboarding/complete')
        .set('Authorization', bearer(session.accessToken))
        .send(validOnboardingBody());

      expect(res.status).toBe(201);
      expect(res.body.dailyCalories).toBeTruthy();
      expect(res.body.projection).toBeTruthy();
      expect(typeof res.body.bodyFatPct).toBe('number');
      expect(typeof res.body.leanBodyMassKg).toBe('number');
      expect(res.body).toHaveProperty('shoulderToWaistRatio');
    });
  });

  describe('goal-management smoke', () => {
    it('covers PATCH /goal', async () => {
      const session = await createOnboardedSession();
      const res = await request(app)
        .patch('/goal')
        .set('Authorization', bearer(session.accessToken))
        .send({ goal: 'maintain', weeklyPaceKg: 0.3 });

      expect(res.status).toBe(200);
      expect(res.body.dailyCalories).toBeTruthy();
    });
  });

  describe('daily-tracking smoke', () => {
    it('covers GET /tracking/today-status and /tracking/week-progress', async () => {
      const session = await createOnboardedSession();
      await seedMealTrackingData(session.userId);

      const todayStatusRes = await request(app)
        .get('/tracking/today-status')
        .set('Authorization', bearer(session.accessToken));
      expect(todayStatusRes.status).toBe(200);
      expect(todayStatusRes.body.date).toBeTruthy();

      const weekStart = toDateOnlyUtc(startOfCurrentUtcWeek());
      const weekProgressRes = await request(app)
        .get(`/tracking/week-progress?weekStart=${weekStart}`)
        .set('Authorization', bearer(session.accessToken));
      expect(weekProgressRes.status).toBe(200);
      expect(Object.keys(weekProgressRes.body).length).toBeGreaterThan(0);
    });
  });

  describe('body-analytics smoke', () => {
    it('covers analytics and body-measurement endpoints', async () => {
      const session = await createOnboardedSession();
      await seedMealTrackingData(session.userId);
      await seedMealAnalyticsData(session.userId);
      const measurement = await prisma.bodyMeasurement.create({
        data: {
          userId: session.userId,
          metric: 'weight',
          value: 79,
          unit: 'kg',
          date: utcDateOffset(-1),
          source: 'manual',
        },
      });

      const bodyStatsRes = await request(app)
        .get('/analytics/body-stats')
        .set('Authorization', bearer(session.accessToken));
      expect(bodyStatsRes.status).toBe(200);

      const bodyProfileRes = await request(app)
        .get('/analytics/body-profile')
        .set('Authorization', bearer(session.accessToken));
      expect(bodyProfileRes.status).toBe(200);

      const patchBodyProfileRes = await request(app)
        .patch('/analytics/body-profile')
        .set('Authorization', bearer(session.accessToken))
        .send({ waistCm: 84, neckCm: 39 });
      expect(patchBodyProfileRes.status).toBe(200);

      const waistHeightRes = await request(app)
        .get('/analytics/waist-height-ratio')
        .set('Authorization', bearer(session.accessToken));
      expect(waistHeightRes.status).toBe(200);

      const goalProgressRes = await request(app)
        .get('/analytics/goal-progress')
        .set('Authorization', bearer(session.accessToken));
      expect(goalProgressRes.status).toBe(200);

      const goalProgressAliasRes = await request(app)
        .get('/analytics/goal/progress')
        .set('Authorization', bearer(session.accessToken));
      expect(goalProgressAliasRes.status).toBe(200);

      const mealAveragesRes = await request(app)
        .get('/analytics/meals/averages?range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(mealAveragesRes.status).toBe(200);

      const mealWeeklyRes = await request(app)
        .get('/analytics/meals/weekly?metric=protein&range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(mealWeeklyRes.status).toBe(200);

      const mealBreakdownRes = await request(app)
        .get('/analytics/meals/breakdown?range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(mealBreakdownRes.status).toBe(200);

      const topFoodsRes = await request(app)
        .get('/analytics/meals/top-foods?range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(topFoodsRes.status).toBe(200);

      const insightsRes = await request(app)
        .get('/analytics/meals/insights?range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(insightsRes.status).toBe(200);

      const correlationRes = await request(app)
        .get('/analytics/meals/correlation?x=protein&y=weight&range=week')
        .set('Authorization', bearer(session.accessToken));
      expect(correlationRes.status).toBe(200);

      const listMeasurementsRes = await request(app)
        .get('/body-measurements')
        .set('Authorization', bearer(session.accessToken));
      expect(listMeasurementsRes.status).toBe(200);

      const addMeasurementRes = await request(app)
        .post('/body-measurements')
        .set('Authorization', bearer(session.accessToken))
        .send({ metric: 'waist', value: 83, unit: 'cm' });
      expect(addMeasurementRes.status).toBe(201);

      const trendRes = await request(app)
        .get('/body-measurements/trend?metric=weight&range=1M')
        .set('Authorization', bearer(session.accessToken));
      expect(trendRes.status).toBe(200);

      const updateMeasurementRes = await request(app)
        .patch(`/body-measurements/${measurement.id}`)
        .set('Authorization', bearer(session.accessToken))
        .send({ value: 78.5 });
      expect(updateMeasurementRes.status).toBe(200);

      const deleteMeasurementRes = await request(app)
        .delete(`/body-measurements/${measurement.id}`)
        .set('Authorization', bearer(session.accessToken));
      expect(deleteMeasurementRes.status).toBe(204);
    });
  });

  describe('me smoke', () => {
    it('covers all me endpoints', async () => {
      const session = await createOnboardedSession();

      const getProfileRes = await request(app)
        .get('/profile')
        .set('Authorization', bearer(session.accessToken));
      expect(getProfileRes.status).toBe(200);

      const patchProfileRes = await request(app)
        .patch('/profile')
        .set('Authorization', bearer(session.accessToken))
        .send({
          name: 'Smoke User',
          username: `smoke_${session.userId.slice(0, 8)}`,
          bio: 'Smoke bio',
          avatarUrl: 'https://example.com/avatar.jpg',
          heightCm: 181,
          weightKg: 81,
          age: 32,
        });
      expect(patchProfileRes.status).toBe(200);

      const getGoalRes = await request(app)
        .get('/goal')
        .set('Authorization', bearer(session.accessToken));
      expect(getGoalRes.status).toBe(200);

      const patchGoalRes = await request(app)
        .patch('/goal')
        .set('Authorization', bearer(session.accessToken))
        .send({ goalLabel: 'Maintain Weight', weeklyPaceKg: 0.25 });
      expect(patchGoalRes.status).toBe(200);

      const previewGoalRes = await request(app)
        .post('/goal/preview-calories')
        .set('Authorization', bearer(session.accessToken))
        .send({ goalLabel: 'Gain Weight', weeklyPaceKg: 0.2 });
      expect(previewGoalRes.status).toBe(200);

      const getNotificationPreferencesRes = await request(app)
        .get('/notification-preferences')
        .set('Authorization', bearer(session.accessToken));
      expect(getNotificationPreferencesRes.status).toBe(200);

      const patchNotificationPreferencesRes = await request(app)
        .patch('/notification-preferences')
        .set('Authorization', bearer(session.accessToken))
        .send({ breakfast: { enabled: true, time: '09:15' }, weeklyReport: false });
      expect(patchNotificationPreferencesRes.status).toBe(200);

      const getUnitPreferencesRes = await request(app)
        .get('/unit-preferences')
        .set('Authorization', bearer(session.accessToken));
      expect(getUnitPreferencesRes.status).toBe(200);

      const patchUnitPreferencesRes = await request(app)
        .patch('/unit-preferences')
        .set('Authorization', bearer(session.accessToken))
        .send({ weightUnit: 'lbs', waterUnit: 'fl oz' });
      expect(patchUnitPreferencesRes.status).toBe(200);

      const listFavoriteRecipesRes = await request(app)
        .get('/favorite-recipes')
        .set('Authorization', bearer(session.accessToken));
      expect(listFavoriteRecipesRes.status).toBe(200);

      const createFavoriteRecipeRes = await request(app)
        .post('/favorite-recipes')
        .set('Authorization', bearer(session.accessToken))
        .send({
          title: 'Protein Pancakes',
          imageUrl: 'https://example.com/pancakes.jpg',
          emoji: '🥞',
          kcal: 420,
          prepTimeMinutes: 15,
        });
      expect(createFavoriteRecipeRes.status).toBe(201);

      // A meal saved from the Social feed → a favorite with full macros + a
      // re-signable photo, idempotent per (user, mealPhotoId).
      const favPhotoId = randomUUID();
      const favMealRes = await request(app)
        .post('/favorite-recipes')
        .set('Authorization', bearer(session.accessToken))
        .send({
          title: 'Lentil Soup',
          kcal: 420,
          proteinG: 32,
          carbsG: 45,
          fatG: 12,
          mealPhotoId: favPhotoId,
          mealPhotoOwnerId: randomUUID(),
        });
      expect(favMealRes.status).toBe(201);
      expect(favMealRes.body.proteinG).toBe(32);
      expect(favMealRes.body.prepTimeMinutes).toBeNull();
      expect(favMealRes.body.mealPhotoId).toBe(favPhotoId);
      expect(typeof favMealRes.body.imageUrl).toBe('string');

      const favDupRes = await request(app)
        .post('/favorite-recipes')
        .set('Authorization', bearer(session.accessToken))
        .send({ title: 'Lentil Soup', kcal: 420, mealPhotoId: favPhotoId });
      expect(favDupRes.body.id).toBe(favMealRes.body.id);

      const listFavAfter = await request(app)
        .get('/favorite-recipes')
        .set('Authorization', bearer(session.accessToken));
      expect(
        listFavAfter.body.filter(
          (f: { mealPhotoId: string | null }) => f.mealPhotoId === favPhotoId,
        ),
      ).toHaveLength(1);

      const deleteFavoriteRecipeRes = await request(app)
        .delete(`/favorite-recipes/${createFavoriteRecipeRes.body.id}`)
        .set('Authorization', bearer(session.accessToken));
      expect(deleteFavoriteRecipeRes.status).toBe(204);

      const listMyMealsRes = await request(app)
        .get('/my-meals')
        .set('Authorization', bearer(session.accessToken));
      expect(listMyMealsRes.status).toBe(200);

      const createMyMealRes = await request(app)
        .post('/my-meals')
        .set('Authorization', bearer(session.accessToken))
        .send({
          title: 'Chicken Bowl',
          imageUrl: 'https://example.com/bowl.jpg',
          emoji: '🍲',
          kcal: 510,
          proteinG: 40,
        });
      expect(createMyMealRes.status).toBe(201);

      // A meal saved from the Social feed carries full macros + a re-signable
      // photo reference; `imageUrl` comes back as a fresh signed URL.
      const soupPhotoId = randomUUID();
      const photoMealRes = await request(app)
        .post('/my-meals')
        .set('Authorization', bearer(session.accessToken))
        .send({
          title: 'Lentil Soup',
          kcal: 420,
          proteinG: 32,
          carbsG: 45,
          fatG: 12,
          mealPhotoId: soupPhotoId,
          mealPhotoOwnerId: randomUUID(),
        });
      expect(photoMealRes.status).toBe(201);
      expect(photoMealRes.body.carbsG).toBe(45);
      expect(photoMealRes.body.fatG).toBe(12);
      expect(photoMealRes.body.mealPhotoId).toBe(soupPhotoId);
      expect(typeof photoMealRes.body.imageUrl).toBe('string');

      // Saving the same photo again is idempotent — same row, no duplicate.
      const dupRes = await request(app)
        .post('/my-meals')
        .set('Authorization', bearer(session.accessToken))
        .send({ title: 'Lentil Soup', kcal: 420, proteinG: 32, mealPhotoId: soupPhotoId });
      expect(dupRes.status).toBe(201);
      expect(dupRes.body.id).toBe(photoMealRes.body.id);

      const listWithPhoto = await request(app)
        .get('/my-meals')
        .set('Authorization', bearer(session.accessToken));
      expect(listWithPhoto.status).toBe(200);
      const soups = listWithPhoto.body.filter(
        (m: { mealPhotoId: string | null }) => m.mealPhotoId === soupPhotoId,
      );
      expect(soups).toHaveLength(1);
      expect(soups[0].carbsG).toBe(45);

      const patchMyMealRes = await request(app)
        .patch(`/my-meals/${createMyMealRes.body.id}`)
        .set('Authorization', bearer(session.accessToken))
        .send({ kcal: 530 });
      expect(patchMyMealRes.status).toBe(200);

      const deleteMyMealRes = await request(app)
        .delete(`/my-meals/${createMyMealRes.body.id}`)
        .set('Authorization', bearer(session.accessToken));
      expect(deleteMyMealRes.status).toBe(204);

      const subscriptionPlansRes = await request(app)
        .get('/subscription/plans')
        .set('Authorization', bearer(session.accessToken));
      expect(subscriptionPlansRes.status).toBe(200);
      expect(subscriptionPlansRes.body).toHaveLength(2);
    });
  });

  describe('nutrition-logging smoke', () => {
    it('covers nutrition logging endpoints', async () => {
      const session = await createOnboardedSession();

      const createRes = await request(app)
        .post('/nutrition-logs')
        .set('Authorization', bearer(session.accessToken))
        .send({
          mealType: 'breakfast',
          timeZone: 'UTC',
          entries: [mealEntry('entry-a', 'Eggs')],
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.entries).toHaveLength(1);

      const replaceRes = await request(app)
        .put('/nutrition-logs/meal-slot')
        .set('Authorization', bearer(session.accessToken))
        .send({
          mealType: 'breakfast',
          timeZone: 'UTC',
          entries: [
            {
              ...mealEntry('entry-b', 'Toast'),
              source: 'photo',
              mealPhotoId: 'photo-entry-b',
              photoUrl: null,
              imageUrl: '',
            },
          ],
        });
      expect(replaceRes.status).toBe(200);

      const summaryRes = await request(app)
        .get('/nutrition-logs/day-summary?timeZone=UTC')
        .set('Authorization', bearer(session.accessToken));
      expect(summaryRes.status).toBe(200);

      // "My Meals" history — recent logged slots, newest-first.
      const historyRes = await request(app)
        .get('/nutrition-logs/history?limit=10')
        .set('Authorization', bearer(session.accessToken));
      expect(historyRes.status).toBe(200);
      expect(Array.isArray(historyRes.body)).toBe(true);
      const bfast = historyRes.body.find(
        (s: { mealType: string }) => s.mealType === 'breakfast',
      );
      expect(bfast).toBeTruthy();
      expect(typeof bfast.calories).toBe('number');
      expect(Array.isArray(bfast.items)).toBe(true);
      expect(typeof bfast.photoUrl).toBe('string'); // entry-b is source 'photo'

      const updateRes = await request(app)
        .patch('/nutrition-logs/entries/entry-b')
        .set('Authorization', bearer(session.accessToken))
        .send({
          mealType: 'breakfast',
          timeZone: 'UTC',
          entry: mealEntry('entry-b', 'Toast Updated'),
        });
      expect(updateRes.status).toBe(200);

      const deleteRes = await request(app)
        .delete('/nutrition-logs/entries/entry-b')
        .set('Authorization', bearer(session.accessToken))
        .send({
          mealType: 'breakfast',
          timeZone: 'UTC',
        });
      expect(deleteRes.status).toBe(200);
    });
  });

  describe('food-recognition smoke', () => {
    it('covers all food recognition endpoints', async () => {
      const session = await createSession();
      await prisma.foodCatalogItem.create({
        data: {
          name: 'Chicken Breast',
          caloriesPer100g: 165,
          proteinPer100g: 31,
          carbsPer100g: 0,
          fatPer100g: 3.6,
        },
      });

      const photoRes = await request(app)
        .post('/food/photo')
        .set('Authorization', bearer(session.accessToken))
        .send({ mealPhotoId: 'smoke-photo-1' });
      expect(photoRes.status).toBe(202);

      const photoStatusRes = await request(app)
        .get('/food/photo/smoke-photo-1')
        .set('Authorization', bearer(session.accessToken));
      expect(photoStatusRes.status).toBe(200);

      const barcodeRes = await request(app)
        .post('/food/barcode')
        .set('Authorization', bearer(session.accessToken))
        .send({ barcode: '1234567890' });
      expect(barcodeRes.status).toBe(200);

      const textRes = await request(app)
        .post('/food/text')
        .set('Authorization', bearer(session.accessToken))
        .send({ text: '200g chicken salad with yogurt dressing' });
      expect(textRes.status).toBe(200);

      const searchRes = await request(app)
        .get('/food/search?q=chicken&limit=5')
        .set('Authorization', bearer(session.accessToken));
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('media-upload smoke', () => {
    it('covers POST /media/upload', async () => {
      const session = await createSession();
      const res = await request(app)
        .post('/media/upload')
        .set('Authorization', bearer(session.accessToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.mealPhotoId).toBeTruthy();
      expect(res.body.uploadUrl).toBeTruthy();
    });
  });

  describe('chat smoke', () => {
    it('covers chat send and history endpoints', async () => {
      const session = await createOnboardedSession();
      const conversationId = 'smoke-conversation-1';

      const sendRes = await request(app)
        .post(`/chat/${conversationId}/messages`)
        .set('Authorization', bearer(session.accessToken))
        .send({ content: 'hello smoke test' });

      expect(sendRes.status).toBe(200);
      expect(sendRes.text).toContain('event: text');
      expect(sendRes.text).toContain('event: done');

      const historyRes = await request(app)
        .get(`/chat/${conversationId}`)
        .set('Authorization', bearer(session.accessToken));
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.id).toBe(conversationId);
      expect(historyRes.body.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('subscription smoke', () => {
    it('covers subscription purchase and status endpoints', async () => {
      const session = await createSession();

      const purchaseRes = await request(app)
        .post('/subscription/purchase')
        .set('Authorization', bearer(session.accessToken))
        .send({
          provider: 'apple',
          productId: 'premium.monthly',
          receiptToken: 'smoke-receipt',
          expiresAt: '2026-12-31T00:00:00.000Z',
        });
      expect(purchaseRes.status).toBe(200);
      expect(purchaseRes.body.isPremium).toBe(true);

      const statusRes = await request(app)
        .get('/subscription/status')
        .set('Authorization', bearer(session.accessToken));
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.isPremium).toBe(true);
    });
  });

  describe('social smoke', () => {
    it('covers post, feed, edit, like, comment, reply, and delete', async () => {
      const author = await createSession();
      const viewer = await createSession();
      const mealPhotoId = randomUUID();

      // A completed photo recognition backs the shared meal's nutrition.
      await prisma.foodEntry.create({
        data: {
          id: mealPhotoId,
          userId: author.userId,
          status: 'completed',
          resultJson: {
            macros: {
              totalCalories: 420,
              totalProteinGrams: 32,
              totalCarbsGrams: 45,
              totalFatGrams: 12,
            },
          },
        },
      });

      const createRes = await request(app)
        .post('/social/posts')
        .set('Authorization', bearer(author.accessToken))
        .send({ mealPhotoId, caption: 'post-lunch bowl' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.isMine).toBe(true);
      expect(createRes.body.nutrition).toEqual({
        calories: 420,
        proteinG: 32,
        carbsG: 45,
        fatG: 12,
      });
      const postId: string = createRes.body.id;

      const feedRes = await request(app)
        .get('/social/feed')
        .set('Authorization', bearer(viewer.accessToken));
      expect(feedRes.status).toBe(200);
      expect(Array.isArray(feedRes.body)).toBe(true);
      expect(feedRes.body[0]?.id).toBe(postId);
      expect(feedRes.body[0]?.isMine).toBe(false);
      expect(feedRes.body[0]?.nutrition?.calories).toBe(420);

      const editRes = await request(app)
        .patch(`/social/posts/${postId}`)
        .set('Authorization', bearer(author.accessToken))
        .send({ caption: 'edited caption' });
      expect(editRes.status).toBe(200);
      expect(editRes.body.edited).toBe(true);

      const forbiddenRes = await request(app)
        .patch(`/social/posts/${postId}`)
        .set('Authorization', bearer(viewer.accessToken))
        .send({ caption: 'not yours' });
      expect(forbiddenRes.status).toBe(403);

      const likeRes = await request(app)
        .post(`/social/posts/${postId}/like`)
        .set('Authorization', bearer(viewer.accessToken))
        .send({ liked: true });
      expect(likeRes.status).toBe(200);
      expect(likeRes.body.likeCount).toBe(1);
      expect(likeRes.body.likedByMe).toBe(true);

      const commentRes = await request(app)
        .post(`/social/posts/${postId}/comments`)
        .set('Authorization', bearer(viewer.accessToken))
        .send({ text: 'looks great' });
      expect(commentRes.status).toBe(201);
      const commentId: string = commentRes.body.id;

      const replyRes = await request(app)
        .post(`/social/posts/${postId}/comments`)
        .set('Authorization', bearer(author.accessToken))
        .send({ text: 'thanks!', parentId: commentId });
      expect(replyRes.status).toBe(201);
      expect(replyRes.body.parentId).toBe(commentId);

      const commentsRes = await request(app)
        .get(`/social/posts/${postId}/comments`)
        .set('Authorization', bearer(author.accessToken));
      expect(commentsRes.status).toBe(200);
      expect(Array.isArray(commentsRes.body)).toBe(true);
      expect(commentsRes.body).toHaveLength(2);

      const commentLikeRes = await request(app)
        .post(`/social/comments/${commentId}/like`)
        .set('Authorization', bearer(author.accessToken))
        .send({ liked: true });
      expect(commentLikeRes.status).toBe(200);
      expect(commentLikeRes.body.likeCount).toBe(1);

      const postRes = await request(app)
        .get(`/social/posts/${postId}`)
        .set('Authorization', bearer(author.accessToken));
      expect(postRes.status).toBe(200);
      expect(postRes.body.commentCount).toBe(2);

      const deleteRes = await request(app)
        .delete(`/social/posts/${postId}`)
        .set('Authorization', bearer(author.accessToken));
      expect(deleteRes.status).toBe(204);

      const goneRes = await request(app)
        .get(`/social/posts/${postId}`)
        .set('Authorization', bearer(author.accessToken));
      expect(goneRes.status).toBe(404);
    });

    it('filters the feed by calorie / macro range and re-syncs on a meal edit', async () => {
      const author = await createOnboardedSession();
      const viewer = await createSession();
      const mealPhotoId = randomUUID();

      await prisma.foodEntry.create({
        data: {
          id: mealPhotoId,
          userId: author.userId,
          status: 'completed',
          resultJson: {
            macros: {
              totalCalories: 400,
              totalProteinGrams: 40,
              totalCarbsGrams: 20,
              totalFatGrams: 12,
            },
          },
        },
      });

      // Log the meal so the photo entry lives in a slot the author can edit.
      await request(app)
        .put('/nutrition-logs/meal-slot')
        .set('Authorization', bearer(author.accessToken))
        .send({
          mealType: 'lunch',
          timeZone: 'UTC',
          entries: [
            {
              id: mealPhotoId,
              mealPhotoId,
              source: 'photo',
              name: 'Lean bowl',
              portionGrams: 300,
              calories: 400,
              proteinG: 40,
              carbsG: 20,
              fatG: 12,
            },
          ],
        });

      const created = await request(app)
        .post('/social/posts')
        .set('Authorization', bearer(author.accessToken))
        .send({ mealPhotoId, caption: 'lean bowl' });
      expect(created.status).toBe(201);
      const postId: string = created.body.id;

      const inRange = await request(app)
        .get('/social/feed?minKcal=300&maxKcal=500&minProteinG=35&maxFatG=20')
        .set('Authorization', bearer(viewer.accessToken));
      expect(inRange.status).toBe(200);
      expect(inRange.body.map((p: { id: string }) => p.id)).toContain(postId);

      const outOfRange = await request(app)
        .get('/social/feed?minKcal=600')
        .set('Authorization', bearer(viewer.accessToken));
      expect(outOfRange.body.map((p: { id: string }) => p.id)).not.toContain(postId);

      const badFilter = await request(app)
        .get('/social/feed?minKcal=500&maxKcal=300')
        .set('Authorization', bearer(viewer.accessToken));
      expect(badFilter.status).toBe(400);

      // Author edits the logged meal up to 700 kcal — the shared post follows.
      const editRes = await request(app)
        .patch(`/nutrition-logs/entries/${mealPhotoId}`)
        .set('Authorization', bearer(author.accessToken))
        .send({
          mealType: 'lunch',
          timeZone: 'UTC',
          entry: {
            id: mealPhotoId,
            mealPhotoId,
            source: 'photo',
            name: 'Loaded bowl',
            portionGrams: 500,
            calories: 700,
            proteinG: 45,
            carbsG: 60,
            fatG: 30,
          },
        });
      expect(editRes.status).toBe(200);

      const afterEdit = await request(app)
        .get(`/social/posts/${postId}`)
        .set('Authorization', bearer(viewer.accessToken));
      expect(afterEdit.body.nutrition).toEqual({
        calories: 700,
        proteinG: 45,
        carbsG: 60,
        fatG: 30,
      });

      const nowInRange = await request(app)
        .get('/social/feed?minKcal=650&maxKcal=750')
        .set('Authorization', bearer(viewer.accessToken));
      expect(nowInRange.body.map((p: { id: string }) => p.id)).toContain(postId);
    });

    it('back-fills a post whose macro columns were never populated', async () => {
      const author = await createSession();
      const viewer = await createSession();
      const mealPhotoId = randomUUID();

      // Item-list resultJson shape — the shape the column migration skipped.
      await prisma.foodEntry.create({
        data: {
          id: mealPhotoId,
          userId: author.userId,
          status: 'completed',
          resultJson: {
            items: [
              { name: 'Rice', calories: 220, proteinG: 5, carbsG: 45, fatG: 2 },
              { name: 'Beans', calories: 180, proteinG: 12, carbsG: 25, fatG: 3 },
            ],
          },
        },
      });

      const created = await request(app)
        .post('/social/posts')
        .set('Authorization', bearer(author.accessToken))
        .send({ mealPhotoId, caption: 'rice and beans' });
      const postId: string = created.body.id;

      // Simulate a pre-migration row: wipe the denormalized columns.
      await prisma.socialPost.update({
        where: { id: postId },
        data: { calories: null, proteinG: null, carbsG: null, fatG: null },
      });

      const feedRes = await request(app)
        .get('/social/feed')
        .set('Authorization', bearer(viewer.accessToken));
      const post = feedRes.body.find((p: { id: string }) => p.id === postId);
      expect(post.nutrition).toEqual({ calories: 400, proteinG: 17, carbsG: 70, fatG: 5 });

      // The read healed the columns — a macro-filtered query now finds it.
      const filtered = await request(app)
        .get('/social/feed?minKcal=350&maxKcal=450')
        .set('Authorization', bearer(viewer.accessToken));
      expect(filtered.body.map((p: { id: string }) => p.id)).toContain(postId);

      const stored = await prisma.socialPost.findUnique({ where: { id: postId } });
      expect(stored?.calories).toBe(400);
    });
  });

  describe('notifications smoke', () => {
    it('documents that the notifications router is mounted but exposes no endpoints yet', async () => {
      const session = await createSession();
      const res = await request(app)
        .get('/notifications')
        .set('Authorization', bearer(session.accessToken));

      expect(res.status).toBe(404);
    });
  });

  async function createSession(): Promise<Session> {
    const email = uniqueEmail('smoke');
    const password = 'StrongPass123!';
    const res = await request(app).post('/auth/sign-up').send({ email, password });

    expect(res.status).toBe(201);

    return {
      userId: res.body.userId,
      email,
      password,
      accessToken: res.body.accessToken,
      refreshToken: res.body.refreshToken,
    };
  }

  async function createOnboardedSession(): Promise<Session> {
    const session = await createSession();
    const onboardingRes = await request(app)
      .post('/onboarding/complete')
      .set('Authorization', bearer(session.accessToken))
      .send(validOnboardingBody());

    expect(onboardingRes.status).toBe(201);
    return session;
  }
});

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

function validOnboardingBody() {
  return {
    weightKg: 82,
    targetWeightKg: 75,
    heightCm: 178,
    age: 31,
    gender: 'male',
    workoutsPerWeek: 3,
    goal: 'lose',
    weeklyPaceKg: 0.5,
  };
}

function mealEntry(id: string, name: string) {
  return {
    id,
    name,
    source: 'manual',
    portionGrams: 120,
    calories: 220,
    proteinG: 18,
    carbsG: 12,
    fatG: 8,
  };
}

function startOfCurrentUtcWeek(): Date {
  const date = new Date();
  const start = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const weekday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - weekday);
  return start;
}

function utcDateOffset(daysFromToday: number): Date {
  const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date;
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seedMealTrackingData(prisma: PrismaClient, userId: string): Promise<void>;
async function seedMealTrackingData(userId: string): Promise<void>;
async function seedMealTrackingData(prismaOrUserId: PrismaClient | string, maybeUserId?: string): Promise<void> {
  const prisma = typeof prismaOrUserId === 'string' ? null : prismaOrUserId;
  const userId = typeof prismaOrUserId === 'string' ? prismaOrUserId : maybeUserId!;
  const db = prisma ?? (await import('../../src/shared/persistence/db')).prisma;

  const today = utcDateOffset(0);
  const entries: Prisma.InputJsonValue[] = [
    { id: 'breakfast-entry', name: 'Eggs', source: 'manual', portionGrams: 100, calories: 180, proteinG: 14, carbsG: 2, fatG: 12 },
    { id: 'lunch-entry', name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12 },
    { id: 'dinner-entry', name: 'Rice Bowl', source: 'manual', portionGrams: 240, calories: 410, proteinG: 16, carbsG: 58, fatG: 10 },
  ];

  await db.mealItem.createMany({
    data: [
      { userId, date: today, mealType: 'breakfast', entries: [entries[0]!] },
      { userId, date: today, mealType: 'lunch', entries: [entries[1]!] },
      { userId, date: today, mealType: 'dinner', entries: [entries[2]!] },
    ],
  });
}

async function seedMealAnalyticsData(userId: string): Promise<void> {
  const { prisma } = await import('../../src/shared/persistence/db');
  await prisma.mealLogReadModel.createMany({
    data: [
      {
        userId,
        date: utcDateOffset(-1),
        mealType: 'breakfast',
        entries: [
          { name: 'Eggs', source: 'manual', portionGrams: 100, calories: 200, proteinG: 18, carbsG: 2, fatG: 14, fiberG: 0 },
        ],
      },
      {
        userId,
        date: utcDateOffset(0),
        mealType: 'dinner',
        entries: [
          { name: 'Chicken', source: 'manual', portionGrams: 180, calories: 320, proteinG: 40, carbsG: 0, fatG: 12, fiberG: 0 },
        ],
      },
    ],
  });
}

async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "messages",
      "conversations",
      "subscriptions",
      "saved_meals",
      "favorite_recipes",
      "notification_preferences",
      "unit_preferences",
      "meal_log_read_models",
      "body_measurements",
      "outbox_events",
      "meal_items",
      "food_entries",
      "food_catalog_items",
      "refresh_tokens",
      "plans",
      "user_profiles",
      "users"
    RESTART IDENTITY CASCADE;
  `);
}
