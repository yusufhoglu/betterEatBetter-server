import type { NextFunction, Request, Response } from 'express';
import { getTraceId } from '../../../shared/observability/tracer';
import { TRACE_ID_HEADER } from '../../../shared/observability/tracingMiddleware';

const mockWarn = jest.fn();
const mockCheckRateLimit = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../shared/observability/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    warn: mockWarn,
  })),
}));

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

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
