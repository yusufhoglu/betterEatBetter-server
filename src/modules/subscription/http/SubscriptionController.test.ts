import express from 'express';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { errorMapperMiddleware } from '../../../shared/errors/errorMapper';
import { SubscriptionController } from './SubscriptionController';

function buildApp() {
  const controller = new SubscriptionController(
    {
      execute: async () => ({
        id: 'sub-1',
        userId: 'user-1',
        productId: 'yearly',
        provider: 'apple',
        status: 'active',
        expiresAt: new Date('2026-09-24T00:00:00.000Z'),
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
    { execute: async () => true } as never,
    {
      findLatestByUserId: async () => ({
        id: 'sub-1',
        userId: 'user-1',
        productId: 'yearly',
        provider: 'apple',
        status: 'active',
        expiresAt: new Date('2026-09-24T00:00:00.000Z'),
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as never,
  );

  const fakeAuthMiddleware: RequestHandler = (req, _res, next) => {
    req.auth = { userId: 'user-1' };
    next();
  };

  const app = express();
  app.use(express.json());
  app.post('/purchase', fakeAuthMiddleware, controller.handlePurchase);
  app.get('/status', fakeAuthMiddleware, controller.handleStatus);
  app.use(errorMapperMiddleware);

  return app;
}

describe('SubscriptionController', () => {
  test('POST /purchase returns normalized subscription state', async () => {
    const app = buildApp();

    const res = await request(app).post('/purchase').send({
      provider: 'apple',
      productId: 'yearly',
      receiptToken: 'apple:test-token',
      expiresAt: '2026-09-24T00:00:00Z',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'sub-1',
      provider: 'apple',
      productId: 'yearly',
      status: 'active',
      expiresAt: '2026-09-24T00:00:00.000Z',
      isPremium: true,
    });
  });

  test('GET /status returns the latest subscription state', async () => {
    const app = buildApp();

    const res = await request(app).get('/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isPremium: true,
      provider: 'apple',
      productId: 'yearly',
      status: 'active',
      expiresAt: '2026-09-24T00:00:00.000Z',
    });
  });

  test('POST /purchase validates the request body', async () => {
    const app = buildApp();

    const res = await request(app).post('/purchase').send({
      provider: 'apple',
      productId: '',
      receiptToken: 'apple:test-token',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST_BODY');
  });
});
