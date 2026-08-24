import type { NextFunction, Request, Response } from 'express';
import { createModuleLogger } from './logger';

const logger = createModuleLogger('http');

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  logger.info(
    {
      method: req.method,
      path: req.originalUrl,
      bodyKeys: Object.keys((req.body ?? {}) as Record<string, unknown>),
    },
    'request received',
  );

  res.on('finish', () => {
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'request completed',
    );
  });

  next();
}
