import express from 'express';
import { OAuth2Client, JWT as GoogleJwtClient } from 'google-auth-library';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { errorMapperMiddleware } from '../../src/shared/errors/errorMapper';
import { signAccessToken } from '../../src/shared/auth/jwt';

/**
 * E2E test: Google Play subscription purchase -> RTDN webhook -> reconciled
 * entitlement, against a real Postgres (testcontainers) and the real
 * production wiring (`subscriptionRoutes()` with PrismaSubscriptionRepository/
 * GoogleReceiptAdapter/GooglePubSubVerifier — no fakes). Routes and JSON
 * shapes follow subscription-backend-contract.md exactly.
 *
 * Google itself is out of reach in CI, so only the network boundary is
 * stubbed: global fetch (the Play Developer API call) and google-auth-library
 * (service-account auth + Pub/Sub OIDC verification). Same reasoning as
 * photo-recognition-flow.e2e.test.ts: the BullMQ queue is stubbed too, so
 * this test asserts the webhook enqueues the right job, then drives the
 * same repository/adapter the real worker (processPlayRtdnJob) would use to
 * simulate that job completing — without needing a second Redis container.
 */
jest.mock('../../src/shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({ add: jest.fn().mockResolvedValue({ id: 'test-job-id' }) })),
  createWorker: jest.fn(),
}));

describe('subscription-purchase-rtdn-flow (E2E)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let app: express.Express;
  let userId: string;
  let accessToken: string;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    const { subscriptionRoutes } = await import('../../src/modules/subscription/http/subscriptionRoutes');
    ({ prisma } = await import('../../src/shared/persistence/db'));

    app = express();
    app.use(express.json());
    app.use('/subscription', subscriptionRoutes());
    app.use(errorMapperMiddleware);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    // Both methods have overloaded (promise vs. callback) signatures that
    // defeat jest's SpiedFunction inference — cast to a plain jest.Mock.
    (jest.spyOn(GoogleJwtClient.prototype, 'getAccessToken') as unknown as jest.Mock).mockResolvedValue({
      token: 'fake-access-token',
    });
    (jest.spyOn(OAuth2Client.prototype, 'verifyIdToken') as unknown as jest.Mock).mockResolvedValue({});
    fetchSpy = jest.spyOn(global, 'fetch');

    const user = await prisma.user.create({
      data: { email: `${Date.now()}-${Math.random()}@test.local`, passwordHash: 'not-a-real-hash' },
    });
    userId = user.id;
    accessToken = signAccessToken(userId);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.subscription.deleteMany();
    await prisma.user.deleteMany();
  });

  function googlePlayResponse(overrides: {
    subscriptionState: string;
    productId?: string;
    expiryTime?: string;
    autoRenewEnabled?: boolean;
  }) {
    return new Response(
      JSON.stringify({
        subscriptionState: overrides.subscriptionState,
        lineItems: [
          {
            productId: overrides.productId ?? 'premium_yearly',
            expiryTime: overrides.expiryTime ?? '2027-01-01T00:00:00.000Z',
            autoRenewingPlan: { autoRenewEnabled: overrides.autoRenewEnabled ?? true },
          },
        ],
      }),
      { status: 200 },
    );
  }

  it('purchase then RTDN cancellation flow updates entitlement end-to-end', async () => {
    const PURCHASE_TOKEN = 'e2e-purchase-token-001';

    // Step 1: client purchased "premium_yearly" via Play Billing, sends the purchaseToken to us
    fetchSpy.mockResolvedValueOnce(googlePlayResponse({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }));

    const verifyRes = await request(app)
      .post('/subscription/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: PURCHASE_TOKEN });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toEqual({
      isPremium: true,
      productId: 'premium_yearly',
      expiresAt: '2027-01-01T00:00:00.000Z',
      willRenew: true,
      inGracePeriod: false,
    });

    const persisted = await prisma.subscription.findFirst({ where: { userId } });
    expect(persisted?.purchaseToken).toBe(PURCHASE_TOKEN);

    // Step 2: Google sends an RTDN that the subscription was canceled
    const notification = Buffer.from(
      JSON.stringify({
        packageName: 'com.hembul.foodtracker',
        subscriptionNotification: { purchaseToken: PURCHASE_TOKEN, subscriptionId: 'premium_yearly', notificationType: 3 },
      }),
    ).toString('base64');

    const webhookRes = await request(app)
      .post('/subscription/play-rtdn')
      .set('Authorization', 'Bearer fake-pubsub-oidc-token')
      .send({ message: { messageId: 'rtdn-msg-1', data: notification } });

    expect(webhookRes.status).toBe(204);

    const { createQueue } = await import('../../src/shared/queue/queueConnection');
    const queueInstance = (createQueue as jest.Mock).mock.results[0]!.value;
    expect(queueInstance.add).toHaveBeenCalledWith(
      'process-play-rtdn',
      expect.objectContaining({ purchaseToken: PURCHASE_TOKEN }),
      { jobId: 'rtdn-msg-1' },
    );

    // Step 3: simulate what processPlayRtdnJob's worker does once it picks up
    // that job — re-verify with Google (now reporting canceled) and persist.
    // A canceled-but-unexpired subscription still grants access per the
    // contract, so push the expiry into the past to observe isPremium flip.
    const { PrismaSubscriptionRepository } = await import(
      '../../src/modules/subscription/adapters/repository/PrismaSubscriptionRepository'
    );
    const { GoogleReceiptAdapter } = await import('../../src/modules/subscription/adapters/billing/GoogleReceiptAdapter');

    fetchSpy.mockResolvedValueOnce(
      googlePlayResponse({
        subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
        expiryTime: '2020-01-01T00:00:00.000Z',
        autoRenewEnabled: false,
      }),
    );

    const repository = new PrismaSubscriptionRepository(prisma);
    const found = await repository.findByPurchaseToken(PURCHASE_TOKEN);
    const validated = await new GoogleReceiptAdapter().validate({
      productId: found!.productId,
      receiptToken: PURCHASE_TOKEN,
    });
    await repository.upsert({
      userId: found!.userId,
      productId: validated.productId,
      provider: found!.provider,
      status: validated.status,
      expiresAt: validated.expiresAt,
      purchaseToken: PURCHASE_TOKEN,
      willRenew: validated.willRenew,
      inGracePeriod: validated.inGracePeriod,
    });

    // Step 4: client polls entitlement — reflects the cancellation + expiry
    const entitlementRes = await request(app)
      .get('/subscription/entitlement')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(entitlementRes.status).toBe(200);
    expect(entitlementRes.body).toEqual({
      isPremium: false,
      productId: 'premium_yearly',
      expiresAt: '2020-01-01T00:00:00.000Z',
      willRenew: false,
      inGracePeriod: false,
    });
  });

  it('rejects a purchaseToken already linked to another user with 409 TOKEN_ALREADY_LINKED', async () => {
    const SHARED_TOKEN = 'e2e-shared-token';
    fetchSpy.mockResolvedValue(googlePlayResponse({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }));

    const firstOwner = await request(app)
      .post('/subscription/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: SHARED_TOKEN });
    expect(firstOwner.status).toBe(200);

    const otherUser = await prisma.user.create({
      data: { email: `${Date.now()}-other@test.local`, passwordHash: 'not-a-real-hash' },
    });
    const otherAccessToken = signAccessToken(otherUser.id);

    const secondOwner = await request(app)
      .post('/subscription/verify')
      .set('Authorization', `Bearer ${otherAccessToken}`)
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: SHARED_TOKEN });

    expect(secondOwner.status).toBe(409);
    expect(secondOwner.body.error.code).toBe('TOKEN_ALREADY_LINKED');
  });

  it('rejects a purchaseToken whose verified productId does not match the claimed productId', async () => {
    fetchSpy.mockResolvedValueOnce(
      googlePlayResponse({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'premium_monthly' }),
    );

    const res = await request(app)
      .post('/subscription/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: 'mismatched-token' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an RTDN webhook call whose push token fails verification', async () => {
    (jest.spyOn(OAuth2Client.prototype, 'verifyIdToken') as unknown as jest.Mock).mockRejectedValueOnce(
      new Error('bad signature'),
    );

    const res = await request(app)
      .post('/subscription/play-rtdn')
      .set('Authorization', 'Bearer tampered-token')
      .send({ message: { messageId: 'rtdn-msg-2', data: 'ignored' } });

    expect(res.status).toBe(400);
  });
});
