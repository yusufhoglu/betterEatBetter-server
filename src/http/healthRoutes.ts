// Liveness + readiness probes for the load balancer / container healthcheck --
// deliberately unauthenticated and mounted before the module router.
import { Router } from 'express';
import { cacheRedisClient } from '../shared/cache/redisCacheClient';
import { createModuleLogger } from '../shared/observability/logger';
import { prisma } from '../shared/persistence/db';
import { queueRedisConnection } from '../shared/queue/redisConnection';

const logger = createModuleLogger('health');
const READINESS_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} check timed out`)), READINESS_TIMEOUT_MS),
    ),
  ]);
}

export function healthRoutes(): Router {
  const router = Router();

  // Liveness: the process is up and the event loop responds. No dependencies.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: safe to route traffic here -- database and both Redis instances reachable.
  router.get('/health/ready', async (_req, res) => {
    const checks = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`, 'postgres'),
      withTimeout(queueRedisConnection.ping(), 'redis-queue'),
      withTimeout(cacheRedisClient.ping(), 'redis-cache'),
    ]);

    const [postgres, redisQueue, redisCache] = checks.map((c) => c.status === 'fulfilled');
    const ready = postgres && redisQueue && redisCache;

    if (!ready) {
      logger.warn({ postgres, redisQueue, redisCache }, 'readiness check failed');
    }

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      checks: { postgres, redisQueue, redisCache },
    });
  });

  return router;
}
