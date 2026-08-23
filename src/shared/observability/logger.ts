// TODO: JSON structured logger (pino); her satira requestId/userId/trace_id ekler
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
