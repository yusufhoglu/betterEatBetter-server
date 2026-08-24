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

function createTransport() {
  const targets: pino.TransportTargetOptions[] = [
    env.NODE_ENV === 'production'
      ? {
          target: 'pino/file',
          options: { destination: 1 },
        }
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            destination: 1,
            translateTime: 'SYS:standard',
          },
        },
  ];

  if (env.LOKI_URL) {
    targets.push({
      target: 'pino-loki',
      options: {
        host: env.LOKI_URL,
        basicAuth: {
          username: env.LOKI_USER_ID,
          password: env.LOKI_API_TOKEN,
        },
        labels: {
          service: 'node-backend',
          environment: process.env.NODE_ENV || 'development',
        },
      },
    });
  }

  return pino.transport({ targets });
}

const rootLogger = pino(
  {
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
  },
  createTransport(),
);

/** Every module gets its own child logger so `module` never has to be typed by hand. */
export function createModuleLogger(moduleName: string): pino.Logger {
  return rootLogger.child({ module: moduleName });
}

export const logger = createModuleLogger('app');
