import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from './tracer';

export const TRACE_ID_HEADER = 'x-trace-id';

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = req.header(TRACE_ID_HEADER) ?? randomUUID();
  res.setHeader(TRACE_ID_HEADER, traceId);
  runWithContext({ traceId }, next);
}
