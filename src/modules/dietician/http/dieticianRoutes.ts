import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { env } from '../../../shared/config/env';
import { createLlmClient } from '../../../shared/llm/llmClientFactory';
import { resolveModel } from '../../../shared/llm/modelTiers';
import { prisma } from '../../../shared/persistence/db';
import { PrismaBodyMeasurementRepository } from '../../body-analytics/adapters/repository/PrismaBodyMeasurementRepository';
import { PrismaMealLogReadModelRepository } from '../../body-analytics/adapters/repository/PrismaMealLogReadModelRepository';
import { OnboardingPlanProfileAdapter } from '../../body-analytics/adapters/profile/OnboardingPlanProfileAdapter';
import { GetBodyStats } from '../../body-analytics/use-cases/GetBodyStats';
import { GetMealAverages } from '../../body-analytics/use-cases/GetMealAverages';
import { LlmTextEstimator } from '../../food-recognition/adapters/text/LlmTextEstimator';
import { RecognizeFromText } from '../../food-recognition/use-cases/RecognizeFromText';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { OnboardingPlanTargetsAdapter } from '../../nutrition-logging/adapters/targets/OnboardingPlanTargetsAdapter';
import { MealLoggedEventPublisher } from '../../nutrition-logging/events/publishers/MealLoggedEventPublisher';
import { GetDayNutrientTotals } from '../../nutrition-logging/use-cases/GetDayNutrientTotals';
import { GetLoggedMealTypesForDateRange } from '../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { LogMealEntries } from '../../nutrition-logging/use-cases/LogMealEntries';
import { ReplaceMealSlotEntries } from '../../nutrition-logging/use-cases/ReplaceMealSlotEntries';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { GetActivePlan } from '../../onboarding-plan/use-cases/GetActivePlan';
import { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import { UpdateProfileMeasurements } from '../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import { PrismaSubscriptionRepository } from '../../subscription/adapters/repository/PrismaSubscriptionRepository';
import { PremiumStatusCache } from '../../subscription/entitlement/PremiumStatusCache';
import { premiumContextMiddleware } from '../../subscription/entitlement/premiumContextMiddleware';
import { GetSubscriptionEntitlement } from '../../subscription/use-cases/GetSubscriptionEntitlement';
import { NutritionLoggingSnapshotAdapter } from '../adapters/context/NutritionLoggingSnapshotAdapter';
import { OnboardingPlanContextAdapter } from '../adapters/context/OnboardingPlanContextAdapter';
import { TieredLlmDieticianAdapter } from '../adapters/llm/TieredLlmDieticianAdapter';
import { PrismaDieticianConversationRepository } from '../adapters/repository/PrismaDieticianConversationRepository';
import { dieticianRateLimiter } from '../rateLimiting/dieticianRateLimiter';
import { ConfirmMealProposal } from '../use-cases/ConfirmMealProposal';
import { GetDieticianConversation } from '../use-cases/GetDieticianConversation';
import { RunDieticianTurn } from '../use-cases/RunDieticianTurn';
import { DieticianAnalyticsTool } from '../use-cases/tools/DieticianAnalyticsTool';
import { DieticianMealDataTool } from '../use-cases/tools/DieticianMealDataTool';
import { ProposeMealLogTool } from '../use-cases/tools/ProposeMealLogTool';
import { ProvideRecipeTool } from '../use-cases/tools/ProvideRecipeTool';
import { RateMealTool } from '../use-cases/tools/RateMealTool';
import { DieticianController } from './DieticianController';

export function dieticianRoutes(): Router {
  const router = Router();

  const conversationRepository = new PrismaDieticianConversationRepository(prisma);
  const llmClient = createLlmClient();
  const llmDieticianPort = new TieredLlmDieticianAdapter(llmClient);
  const cheapModel = resolveModel('cheap');

  const mealItemRepository = new PrismaMealItemRepository(prisma);
  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);

  const getDayNutrientTotals = new GetDayNutrientTotals(mealItemRepository, new OnboardingPlanTargetsAdapter());
  const getUserProfile = new GetUserProfile(userProfileRepository);
  const getActivePlan = new GetActivePlan(planRepository);

  const planContextPort = new OnboardingPlanContextAdapter(getUserProfile, getActivePlan);
  const dailySnapshotPort = new NutritionLoggingSnapshotAdapter(getDayNutrientTotals);

  const profilePort = new OnboardingPlanProfileAdapter(
    getUserProfile,
    new UpdateProfileMeasurements(userProfileRepository, planRepository),
  );
  const getBodyStats = new GetBodyStats(new PrismaBodyMeasurementRepository(prisma), profilePort);
  const getMealAverages = new GetMealAverages(new PrismaMealLogReadModelRepository(prisma));

  const mealEventPublisher = new MealLoggedEventPublisher();
  const logMealEntries = new LogMealEntries(mealItemRepository, mealEventPublisher);
  const replaceMealSlotEntries = new ReplaceMealSlotEntries(mealItemRepository, mealEventPublisher);
  const recognizeFromText = new RecognizeFromText(new LlmTextEstimator());

  const tools = [
    new DieticianMealDataTool(getDayNutrientTotals, new GetLoggedMealTypesForDateRange(mealItemRepository)),
    new DieticianAnalyticsTool(getBodyStats, getMealAverages),
    new ProposeMealLogTool(recognizeFromText),
    new RateMealTool(recognizeFromText, llmClient, cheapModel),
    new ProvideRecipeTool(llmClient, cheapModel),
  ];

  const runDieticianTurn = new RunDieticianTurn(
    llmDieticianPort,
    conversationRepository,
    planContextPort,
    dailySnapshotPort,
    tools,
    env.DIETICIAN_MAX_GATHER_TURNS,
    env.DIETICIAN_DIGEST_EVERY_N_TURNS,
    env.DIETICIAN_MAX_CONTEXT_MESSAGES,
  );
  const getDieticianConversation = new GetDieticianConversation(
    conversationRepository,
    planContextPort,
    dailySnapshotPort,
  );
  const confirmMealProposal = new ConfirmMealProposal(conversationRepository, logMealEntries, replaceMealSlotEntries);

  const controller = new DieticianController(runDieticianTurn, getDieticianConversation, confirmMealProposal);

  const premiumContext = premiumContextMiddleware(
    new PremiumStatusCache(
      new GetSubscriptionEntitlement(new PrismaSubscriptionRepository(prisma)),
      cacheRedisClient,
      env.ENTITLEMENT_CACHE_TTL_SECONDS,
    ),
  );

  router.post(
    '/:conversationId/messages',
    authMiddleware,
    premiumContext,
    dieticianRateLimiter,
    controller.handleSendMessage,
  );
  router.get('/:conversationId', authMiddleware, controller.handleGetConversation);
  router.post('/:conversationId/proposals/confirm', authMiddleware, controller.handleConfirmMealProposal);

  return router;
}
