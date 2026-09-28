import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { env } from '../../../shared/config/env';
import { prisma } from '../../../shared/persistence/db';
import { AdminReassignClient } from '../../practice/use-cases/AdminReassignClient';
import { linkThreads, practiceRepository } from '../../practice/http/practiceWiring';
import { premiumEntitlementCacheKey } from '../../subscription/entitlement/PremiumStatusCache';
import { PrismaAdminRepository } from '../adapters/repository/PrismaAdminRepository';
import { BufferedAiUsageRecorder } from '../adapters/usage/BufferedAiUsageRecorder';
import { AdminAccessPolicy } from '../use-cases/AdminAccessPolicy';
import { AdminQueries } from '../use-cases/AdminQueries';
import { ManageActivationCodes } from '../use-cases/ManageActivationCodes';
import { ManageDietitians } from '../use-cases/ManageDietitians';
import { ManageUsers } from '../use-cases/ManageUsers';
import type { AdminUseCases } from './AdminController';

/** Receives every LLM call's usage (wired in main.ts via setLlmUsageSink). */
export const aiUsageRecorder = new BufferedAiUsageRecorder(prisma);

export function buildAdminUseCases(): AdminUseCases {
  const repository = new PrismaAdminRepository(prisma);
  const reassign = new AdminReassignClient(practiceRepository, linkThreads);
  return {
    access: new AdminAccessPolicy(repository, env.PLATFORM_ADMIN_EMAILS),
    queries: new AdminQueries(repository),
    users: new ManageUsers(repository, {
      invalidate: async (userId) => {
        await cacheRedisClient.del(premiumEntitlementCacheKey(userId));
      },
    }),
    dietitians: new ManageDietitians(repository, (clientId, dietitianId) => reassign.execute(clientId, dietitianId)),
    codes: new ManageActivationCodes(repository),
  };
}
