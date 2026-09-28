import { createHmac } from 'node:crypto';
import { env } from '../../../shared/config/env';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { resolveUserToday } from '../../../shared/domain/resolveUserToday';
import { prisma } from '../../../shared/persistence/db';
import { PrismaStepLogRepository } from '../../activity/adapters/repository/PrismaStepLogRepository';
import { GetStepsForRange } from '../../activity/use-cases/GetStepsForRange';
import { PrismaBodyMeasurementRepository } from '../../body-analytics/adapters/repository/PrismaBodyMeasurementRepository';
import { ListBodyMeasurements } from '../../body-analytics/use-cases/ListBodyMeasurements';
import { threadAdmin } from '../../messaging/http/messagingWiring';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { OnboardingPlanTargetsAdapter } from '../../nutrition-logging/adapters/targets/OnboardingPlanTargetsAdapter';
import { GetDaySummary } from '../../nutrition-logging/use-cases/GetDaySummary';
import { GetMealItemsForRange } from '../../nutrition-logging/use-cases/GetMealItemsForRange';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { GetActivePlan } from '../../onboarding-plan/use-cases/GetActivePlan';
import { GetDailyTargets } from '../../onboarding-plan/use-cases/GetDailyTargets';
import { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import { ReleaseDietitianPlan, SetDietitianPlanTargets } from '../../onboarding-plan/use-cases/SetDietitianPlanTargets';
import { PrismaWaterLogRepository } from '../../water-logging/adapters/repository/PrismaWaterLogRepository';
import { GetWaterForDay } from '../../water-logging/use-cases/GetWaterForDay';
import { GetWaterForRange } from '../../water-logging/use-cases/GetWaterForRange';
import { RedisManagedClientCache } from '../adapters/cache/RedisManagedClientCache';
import { ClientDataAdapter } from '../adapters/client-data/ClientDataAdapter';
import { PrismaPracticeRepository } from '../adapters/repository/PrismaPracticeRepository';
import { MessagingLinkThreadAdapter } from '../adapters/threads/MessagingLinkThreadAdapter';
import { ClientInsightsService } from '../use-cases/ClientInsightsService';
import { IsManagedClient } from '../use-cases/IsManagedClient';

/** Explicit INVITE_CODE_SECRET wins; otherwise a key derived from JWT_SECRET (never the JWT key itself). */
export function resolveInviteCodeSecret(): string {
  return env.INVITE_CODE_SECRET ?? createHmac('sha256', env.JWT_SECRET).update('practice-invite-code').digest('hex');
}

/**
 * Nightly jobs have no request time zone; the product's market is Turkey.
 * (Requests always pass the viewer's own time zone.)
 */
export const PRACTICE_DEFAULT_TIME_ZONE = 'Europe/Istanbul';
export const practiceToday = () => resolveUserToday({ timeZone: PRACTICE_DEFAULT_TIME_ZONE });

export const practiceRepository = new PrismaPracticeRepository(prisma);
export const managedClientCache = new RedisManagedClientCache(cacheRedisClient);
export const linkThreads = new MessagingLinkThreadAdapter(threadAdmin);

/** Public entry point used by the AI coach guard (dietician module). */
export const isManagedClient = new IsManagedClient(practiceRepository, managedClientCache);

export function buildClientDataAdapter(): ClientDataAdapter {
  const planRepository = new PrismaPlanRepository(prisma);
  const profileRepository = new PrismaUserProfileRepository(prisma);
  const mealItemRepository = new PrismaMealItemRepository(prisma);
  const waterRepository = new PrismaWaterLogRepository(prisma);
  return new ClientDataAdapter(prisma, {
    getDaySummary: new GetDaySummary(mealItemRepository, new OnboardingPlanTargetsAdapter()),
    listBodyMeasurements: new ListBodyMeasurements(new PrismaBodyMeasurementRepository(prisma)),
    getWaterForDay: new GetWaterForDay(waterRepository),
    getActivePlan: new GetActivePlan(planRepository),
    setDietitianPlanTargets: new SetDietitianPlanTargets(planRepository),
    releaseDietitianPlan: new ReleaseDietitianPlan(planRepository),
    getMealItemsForRange: new GetMealItemsForRange(mealItemRepository),
    getWaterForRange: new GetWaterForRange(waterRepository),
    getStepsForRange: new GetStepsForRange(new PrismaStepLogRepository(prisma)),
    getDailyTargets: new GetDailyTargets(planRepository, profileRepository),
    getUserProfile: new GetUserProfile(profileRepository),
  });
}

export function buildInsightsService(clientData = buildClientDataAdapter()): ClientInsightsService {
  return new ClientInsightsService(practiceRepository, clientData, linkThreads);
}
