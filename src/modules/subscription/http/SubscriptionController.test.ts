import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { SubscriptionController } from './SubscriptionController';

const ENTITLED = {
  isPremium: true,
  productId: 'premium_yearly',
  expiresAt: new Date('2026-09-24T00:00:00.000Z'),
  willRenew: true,
  inGracePeriod: false,
};

function buildApp(options?: {
  purchaseSubscription?: { execute: () => Promise<unknown> };
  entitlement?: typeof ENTITLED;
  processGooglePlayRtdn?: { execute: () => Promise<void> };
}) {
  const controller = new SubscriptionController(
    (options?.purchaseSubscription ?? { execute: async () => ({}) }) as never,
    { describe: async () => options?.entitlement ?? ENTITLED } as never,
    (options?.processGooglePlayRtdn ?? { execute: async () => {} }) as never,
  );

  const fakeAuthMiddleware: RequestHandler = (req, _res, next) => {
    req.auth = { userId: 'user-1' };
    next();
  };

  const app = express();
  app.use(express.json());
  app.post('/verify', fakeAuthMiddleware, controller.handleVerify);
  app.get('/entitlement', fakeAuthMiddleware, controller.handleEntitlement);
  app.post('/play-rtdn', controller.handlePlayRtdn);
  app.use(errorMapperMiddleware);

  return app;
}

describe('SubscriptionController', () => {
  test('POST /verify returns the Entitlement shape from subscription-backend-contract.md', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/verify')
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: 'purchase-token-123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isPremium: true,
      productId: 'premium_yearly',
      expiresAt: '2026-09-24T00:00:00.000Z',
      willRenew: true,
      inGracePeriod: false,
    });
  });

  test('GET /entitlement returns the caller current Entitlement', async () => {
    const app = buildApp();

    const res = await request(app).get('/entitlement');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isPremium: true,
      productId: 'premium_yearly',
      expiresAt: '2026-09-24T00:00:00.000Z',
      willRenew: true,
      inGracePeriod: false,
    });
  });

  test('GET /entitlement returns the free shape for a user who never subscribed', async () => {
    const app = buildApp({
      entitlement: { isPremium: false, productId: null as never, expiresAt: null as never, willRenew: false, inGracePeriod: false },
    });

    const res = await request(app).get('/entitlement');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isPremium: false,
      productId: null,
      expiresAt: null,
      willRenew: false,
      inGracePeriod: false,
    });
  });

  test('POST /verify rejects a non-android platform', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/verify')
      .send({ platform: 'ios', productId: 'premium_yearly', purchaseToken: 'token' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  test('POST /verify validates the request body', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/verify')
      .send({ platform: 'android', productId: '', purchaseToken: 'token' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  test('POST /verify surfaces a purchase failure (e.g. 409 TOKEN_ALREADY_LINKED) from the use-case', async () => {
    const { ConflictError } = await import('../../../shared/errors/ConflictError');
    const app = buildApp({
      purchaseSubscription: {
        execute: async () => {
          throw new ConflictError('TOKEN_ALREADY_LINKED', 'already linked');
        },
      },
    });

    const res = await request(app)
      .post('/verify')
      .send({ platform: 'android', productId: 'premium_yearly', purchaseToken: 'token' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOKEN_ALREADY_LINKED');
  });

  test('POST /play-rtdn acks with 204 once the notification is processed', async () => {
    const app = buildApp({ processGooglePlayRtdn: { execute: async () => {} } });

    const res = await request(app)
      .post('/play-rtdn')
      .send({ message: { messageId: 'msg-1', data: 'ignored-in-this-fake' } });

    expect(res.status).toBe(204);
  });

  test('POST /play-rtdn surfaces a verification failure as 400', async () => {
    const app = buildApp({
      processGooglePlayRtdn: {
        execute: async () => {
          throw new ValidationError('INVALID_PUSH_TOKEN', 'Pub/Sub push token verification failed');
        },
      },
    });

    const res = await request(app)
      .post('/play-rtdn')
      .send({ message: { messageId: 'msg-1', data: 'ignored-in-this-fake' } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PUSH_TOKEN');
  });
});
