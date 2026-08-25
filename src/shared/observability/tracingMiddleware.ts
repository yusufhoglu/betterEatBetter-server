import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from './tracer';

export const TRACE_ID_HEADER = 'x-trace-id';

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = req.header(TRACE_ID_HEADER) ?? randomUUID();
  res.setHeader(TRACE_ID_HEADER, traceId);
  runWithContext({ traceId }, next);
}

function resolveCanonicalFoodPhotoTraceId(req: Request): string | undefined {
  if (req.method === 'POST' && req.path === '/food/photo') {
    const mealPhotoId = (req.body as { mealPhotoId?: unknown } | undefined)?.mealPhotoId;
    return typeof mealPhotoId === 'string' && mealPhotoId.length > 0 ? mealPhotoId : undefined;
  }

  if (req.method === 'GET') {
    const match = /^\/food\/photo\/([^/]+)$/.exec(req.path);
    return match?.[1];
  }

  return undefined;
}

export function canonicalizeFoodPhotoTraceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const canonicalTraceId = resolveCanonicalFoodPhotoTraceId(req);
  if (!canonicalTraceId) {
    next();
    return;
  }

  res.setHeader(TRACE_ID_HEADER, canonicalTraceId);
  runWithContext({ traceId: canonicalTraceId }, next);
}
