import type { NextFunction, Request, Response } from 'express';
import { DomainError } from './DomainError';
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
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof RateLimitError) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  if (err instanceof DomainError) {
    res.status(err.httpStatus).json({ code: err.code, message: err.message });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
}
