import type { NextFunction, Request, Response } from 'express';
import { getTraceId, runWithContext } from './tracer';
import { canonicalizeFoodPhotoTraceMiddleware, TRACE_ID_HEADER } from './tracingMiddleware';

function createResponseMock(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

describe('canonicalizeFoodPhotoTraceMiddleware', () => {
  it('rebinds POST /food/photo to mealPhotoId before downstream middleware runs', () => {
    const req = {
      method: 'POST',
      path: '/food/photo',
      body: { mealPhotoId: 'photo-123' },
    } as unknown as Request;
    const res = createResponseMock();

    let observedTraceId: string | undefined;
    runWithContext({ traceId: 'incoming-trace' }, () => {
      canonicalizeFoodPhotoTraceMiddleware(req, res, (() => {
        observedTraceId = getTraceId();
      }) as NextFunction);
    });

    expect(observedTraceId).toBe('photo-123');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'photo-123');
  });

  it('rebinds polling GET /food/photo/:mealPhotoId to the path mealPhotoId', () => {
    const req = {
      method: 'GET',
      path: '/food/photo/photo-456',
    } as unknown as Request;
    const res = createResponseMock();

    let observedTraceId: string | undefined;
    runWithContext({ traceId: 'incoming-trace' }, () => {
      canonicalizeFoodPhotoTraceMiddleware(req, res, (() => {
        observedTraceId = getTraceId();
      }) as NextFunction);
    });

    expect(observedTraceId).toBe('photo-456');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, 'photo-456');
  });

  it('leaves non-photo routes on the existing trace', () => {
    const req = {
      method: 'GET',
      path: '/tracking/today-status',
    } as unknown as Request;
    const res = createResponseMock();

    let observedTraceId: string | undefined;
    runWithContext({ traceId: 'incoming-trace' }, () => {
      canonicalizeFoodPhotoTraceMiddleware(req, res, (() => {
        observedTraceId = getTraceId();
      }) as NextFunction);
    });

    expect(observedTraceId).toBe('incoming-trace');
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});
