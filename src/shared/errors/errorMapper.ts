import type { NextFunction, Request, Response } from 'express';
import { DomainError } from './DomainError';
import { IntegrationError } from './IntegrationError';
import { RateLimitError } from './RateLimitError';
import { createModuleLogger } from '../observability/logger';

const logger = createModuleLogger('errorMapper');

/**
 * Central Express error-handling middleware. Any DomainError subclass maps
 * to its fixed HTTP status; anything unrecognized becomes a generic 500 so
 * internals are never leaked to the client.
 */
export function errorMapperMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof RateLimitError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  if (err instanceof IntegrationError && err.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  if (err instanceof DomainError) {
    logger.warn(
      {
        err,
        method: req.method,
        path: req.originalUrl,
        httpStatus: err.httpStatus,
        code: err.code,
      },
      'domain error mapped to http response',
    );
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message },
      code: err.code,
      message: err.message,
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong',
  });
}
