import { createHmac } from 'node:crypto';
import { env } from '../../../shared/config/env';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { prisma } from '../../../shared/persistence/db';
import { RedisManagedClientCache } from '../adapters/cache/RedisManagedClientCache';
import { PrismaPracticeRepository } from '../adapters/repository/PrismaPracticeRepository';
import { IsManagedClient } from '../use-cases/IsManagedClient';

/** Explicit INVITE_CODE_SECRET wins; otherwise a key derived from JWT_SECRET (never the JWT key itself). */
export function resolveInviteCodeSecret(): string {
  return env.INVITE_CODE_SECRET ?? createHmac('sha256', env.JWT_SECRET).update('practice-invite-code').digest('hex');
}

export const practiceRepository = new PrismaPracticeRepository(prisma);
export const managedClientCache = new RedisManagedClientCache(cacheRedisClient);

/** Public entry point used by the AI coach guard (dietician module). */
export const isManagedClient = new IsManagedClient(practiceRepository, managedClientCache);
