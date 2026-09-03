import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Prisma's default pool size is `num_physical_cpus * 2 + 1` — only ~5 on a
 * small box, which starves under a burst of concurrent requests (each chat
 * message alone makes 4-6 queries). We size it explicitly from env and append
 * a `pool_timeout` so a saturated pool fails fast instead of hanging.
 * Anything already set in DATABASE_URL wins.
 *
 * The URL is read live from `process.env` (not the parsed env module) so
 * integration tests that swap `process.env.DATABASE_URL` before importing this
 * file keep working regardless of module-load ordering.
 */
function resolveDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL ?? env.DATABASE_URL;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(env.DATABASE_CONNECTION_LIMIT));
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(env.DATABASE_POOL_TIMEOUT_SECONDS));
    }
    return url.toString();
  } catch {
    // Non-URL-parseable connection strings (rare) are passed through untouched.
    return rawUrl;
  }
}

/** Single shared instance — repositories receive it via constructor injection, never `new PrismaClient()` themselves. */
export const prisma = new PrismaClient({
  datasources: { db: { url: resolveDatabaseUrl() } },
});
