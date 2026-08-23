import pino from 'pino';
import { env } from '../config/env';
import { getTraceContext } from './tracer';

// Defined once, globally — no module is trusted to remember this per call site.
const REDACT_PATHS = [
  'password',
  '*.password',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  '*.authorization',
  'req.headers.authorization',
  'headers.authorization',
];

const rootLogger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  mixin() {
    const context = getTraceContext();
    if (!context) {
      return {};
    }
    return {
      traceId: context.traceId,
      ...(context.userId ? { userId: context.userId } : {}),
      ...(context.messageId ? { messageId: context.messageId } : {}),
    };
  },
});

/** Every module gets its own child logger so `module` never has to be typed by hand. */
export function createModuleLogger(moduleName: string): pino.Logger {
  return rootLogger.child({ module: moduleName });
}

export const logger = createModuleLogger('app');
