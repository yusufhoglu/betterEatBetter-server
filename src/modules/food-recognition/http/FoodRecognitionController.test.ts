import type { NextFunction, Request, Response } from 'express';
import { getTraceId } from '../../../shared/observability/tracer';
import { TRACE_ID_HEADER } from '../../../shared/observability/tracingMiddleware';

const mockWarn = jest.fn();
const mockInfo = jest.fn();
const mockError = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(undefined);
const mockConsumeDailyQuota = jest.fn().mockResolvedValue(undefined);
const mockRefundDailyQuota = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../shared/observability/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  })),
}));

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

jest.mock('../../../shared/rateLimiting/dailyQuota', () => ({
  consumeDailyQuota: (...args: unknown[]) => mockConsumeDailyQuota(...args),
  refundDailyQuota: (...args: unknown[]) => mockRefundDailyQuota(...args),
}));

import { ValidationError } from '../../../shared/errors/ValidationError';
import { RateLimitError } from '../../../shared/errors/RateLimitError';
import { FoodRecognitionController } from './FoodRecognitionController';

function createResponseMock(): Response {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  (res.status as unknown as jest.Mock).mockReturnValue(res);
  (res.json as unknown as jest.Mock).mockReturnValue(res);

  return res;
}

describe('FoodRecognitionController trace binding', () => {
  const recognizeFromBarcode = { execute: jest.fn() } as never;
  const recognizeFromText = { execute: jest.fn() } as never;
  const searchFoodCatalog = { execute: jest.fn() } as never;
  const next = jest.fn() as NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('binds POST /food/photo to mealPhotoId and returns it as x-trace-id', async () => {
    let observedTraceId: string | undefined;
    const recognizeFromPhoto = {
      execute: jest.fn(async () => {
        observedTraceId = getTraceId();
        return { mealPhotoId: 'photo-123' };
      }),
    } as never;
    const repository = { findById: jest.fn() } as never;
    const controller = new FoodRecognitionController(
      recognizeFromPhoto,
      recognizeFromBarcode,
      recognizeFromText,
      searchFoodCatalog,
      repository,
    );

    const req = {
      auth: { userId: 'user-1' },
      body: { mealPhotoId: 'photo-123' },
      header: jest.fn((name: string) => (name === TRACE_ID_HEADER ? 'different-trace' : undefined)),
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handlePhoto(req, res, next);

    expect(observedTraceId).toBe('photo-123');
    expect(mockCheckRateLimit).toHaveBeenCalledWith('photo:user-1', 5, 60);
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'photo-123');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ mealPhotoId: 'photo-123' });
    expect(mockWarn).toHaveBeenCalledWith(
      { incomingTraceId: 'different-trace', traceId: 'photo-123' },
      'x-trace-id does not match mealPhotoId; using mealPhotoId as trace_id',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('binds GET /food/photo/:mealPhotoId polling to the same mealPhotoId trace', async () => {
    let observedTraceId: string | undefined;
    const recognizeFromPhoto = { execute: jest.fn() } as never;
    const repository = {
      findById: jest.fn(async (mealPhotoId: string) => {
        observedTraceId = getTraceId();
        return { id: mealPhotoId, status: 'processing' };
      }),
    } as never;
    const controller = new FoodRecognitionController(
      recognizeFromPhoto,
      recognizeFromBarcode,
      recognizeFromText,
      searchFoodCatalog,
      repository,
    );

    const req = {
      auth: { userId: 'user-1' },
      params: { mealPhotoId: 'photo-123' },
      header: jest.fn((name: string) => (name === TRACE_ID_HEADER ? 'another-trace' : undefined)),
    } as unknown as Request;
    const res = createResponseMock();

    await controller.handleGetPhotoStatus(req, res, next);

    expect(observedTraceId).toBe('photo-123');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'photo-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: 'photo-123', status: 'processing' });
    expect(mockWarn).toHaveBeenCalledWith(
      { incomingTraceId: 'another-trace', traceId: 'photo-123' },
      'x-trace-id does not match mealPhotoId; using mealPhotoId as trace_id',
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('FoodRecognitionController free-tier photo quota', () => {
  const recognizeFromBarcode = { execute: jest.fn() } as never;
  const recognizeFromText = { execute: jest.fn() } as never;
  const searchFoodCatalog = { execute: jest.fn() } as never;
  const repository = { findById: jest.fn() } as never;
  const next = jest.fn() as NextFunction;

  function buildController(executeImpl: () => Promise<{ mealPhotoId: string }>) {
    return new FoodRecognitionController(
      { execute: jest.fn(executeImpl) } as never,
      recognizeFromBarcode,
      recognizeFromText,
      searchFoodCatalog,
      repository,
    );
  }

  function photoRequest(overrides: Partial<Request> = {}): Request {
    return {
      auth: { userId: 'user-1' },
      body: { mealPhotoId: 'photo-123' },
      header: jest.fn(() => undefined),
      ...overrides,
    } as unknown as Request;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsumeDailyQuota.mockResolvedValue(undefined);
    mockRefundDailyQuota.mockResolvedValue(undefined);
  });

  it('consumes the daily quota for a free user and accepts the photo', async () => {
    const controller = buildController(async () => ({ mealPhotoId: 'photo-123' }));
    const res = createResponseMock();

    await controller.handlePhoto(photoRequest({ isPremium: false }), res, next);

    expect(mockConsumeDailyQuota).toHaveBeenCalledWith('photo:user-1', 1);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not touch the quota for a premium user', async () => {
    const controller = buildController(async () => ({ mealPhotoId: 'photo-123' }));
    const res = createResponseMock();

    await controller.handlePhoto(photoRequest({ isPremium: true }), res, next);

    expect(mockConsumeDailyQuota).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('rejects the request when the daily quota is exhausted, without starting recognition', async () => {
    mockConsumeDailyQuota.mockRejectedValue(
      new RateLimitError('FREE_TIER_DAILY_LIMIT', 'Daily free-tier limit reached', 3600),
    );
    const execute = jest.fn(async () => ({ mealPhotoId: 'photo-123' }));
    const controller = new FoodRecognitionController(
      { execute } as never,
      recognizeFromBarcode,
      recognizeFromText,
      searchFoodCatalog,
      repository,
    );
    const res = createResponseMock();

    await controller.handlePhoto(photoRequest({ isPremium: false }), res, next);

    expect(execute).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(202);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FREE_TIER_DAILY_LIMIT' }));
  });

  it('refunds the quota when the photo is rejected by validation', async () => {
    const controller = buildController(async () => {
      throw new ValidationError('PHOTO_TOO_LARGE', 'too big');
    });
    const res = createResponseMock();

    await controller.handlePhoto(photoRequest({ isPremium: false }), res, next);

    expect(mockConsumeDailyQuota).toHaveBeenCalledWith('photo:user-1', 1);
    expect(mockRefundDailyQuota).toHaveBeenCalledWith('photo:user-1');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'PHOTO_TOO_LARGE' }));
  });
});
