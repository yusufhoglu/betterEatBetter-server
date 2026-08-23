// TODO: trace_id yakalama/uretme/yayma mantigi -- bkz. backend-architecture.md SS6
import type { Request, Response, NextFunction } from 'express';

export const TRACE_ID_HEADER = 'x-trace-id';

export function traceIdMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
