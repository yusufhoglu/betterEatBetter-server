// Prometheus scrape endpoint. Deliberately unauthenticated by user JWT — a
// scraper has no session — and instead gated by a shared bearer token. It is
// mounted before the tracing/auth middleware so a scrape never allocates a
// trace context or hits the module router. Keep it off the public internet
// regardless (shared-rule.md: "GET /metrics public DEĞİLDİR").
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../shared/config/env';
import { createModuleLogger } from '../shared/observability/logger';
import { metricsRegistry } from '../shared/observability/metrics';

const logger = createModuleLogger('metrics');

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function metricsRoutes(): Router {
  const router = Router();

  router.get('/metrics', async (req, res, next) => {
    try {
      // Feature off until a token is configured — 404 so its existence isn't advertised.
      if (!env.METRICS_TOKEN) {
        res.status(404).end();
        return;
      }

      const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '').trim();
      if (!provided || !tokenMatches(provided, env.METRICS_TOKEN)) {
        res.status(401).end();
        return;
      }

      res.setHeader('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (err) {
      logger.error({ err }, 'failed to render Prometheus metrics');
      next(err);
    }
  });

  return router;
}
