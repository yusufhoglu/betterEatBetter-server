import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { cacheRedisClient } from '../../../shared/cache/redisCacheClient';
import { env } from '../../../shared/config/env';
import { createLlmClient } from '../../../shared/llm/llmClientFactory';
import { prisma } from '../../../shared/persistence/db';
import { PrismaBodyMeasurementRepository } from '../../body-analytics/adapters/repository/PrismaBodyMeasurementRepository';
import { PrismaMealLogReadModelRepository } from '../../body-analytics/adapters/repository/PrismaMealLogReadModelRepository';
import { OnboardingPlanProfileAdapter } from '../../body-analytics/adapters/profile/OnboardingPlanProfileAdapter';
import { PrismaBodySilhouetteProfileRepository } from '../../body-analytics/adapters/repository/PrismaBodySilhouetteProfileRepository';
import { GetBodyStats } from '../../body-analytics/use-cases/GetBodyStats';
import { GetMealAverages } from '../../body-analytics/use-cases/GetMealAverages';
import { LlmTextEstimator } from '../../food-recognition/adapters/text/LlmTextEstimator';
import { PrismaFoodEntryRepository } from '../../food-recognition/adapters/repository/PrismaFoodEntryRepository';
import { RecognizeFromText } from '../../food-recognition/use-cases/RecognizeFromText';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { OnboardingPlanTargetsAdapter } from '../../nutrition-logging/adapters/targets/OnboardingPlanTargetsAdapter';
import { MealLoggedEventPublisher } from '../../nutrition-logging/events/publishers/MealLoggedEventPublisher';
import { GetDaySummary } from '../../nutrition-logging/use-cases/GetDaySummary';
import { GetLoggedMealTypesForDateRange } from '../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { LogMealEntries } from '../../nutrition-logging/use-cases/LogMealEntries';
import { ReplaceMealSlotEntries } from '../../nutrition-logging/use-cases/ReplaceMealSlotEntries';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import { UpdateProfileMeasurements } from '../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import { PrismaSubscriptionRepository } from '../../subscription/adapters/repository/PrismaSubscriptionRepository';
import { GetSubscriptionEntitlement } from '../../subscription/use-cases/GetSubscriptionEntitlement';
import { PremiumStatusCache } from '../../subscription/entitlement/PremiumStatusCache';
import { premiumContextMiddleware } from '../../subscription/entitlement/premiumContextMiddleware';
import { SharedLlmChatAdapter } from '../adapters/llm/SharedLlmChatAdapter';
import { PrismaConversationRepository } from '../adapters/repository/PrismaConversationRepository';
import { DEFAULT_MAX_CONTEXT_MESSAGES } from '../context/trimConversationHistory';
import { ChatController } from './ChatController';
import { chatRateLimiter } from '../rateLimiting/chatRateLimiter';
import { ConfirmMealProposal } from '../use-cases/ConfirmMealProposal';
import { GetConversationHistory } from '../use-cases/GetConversationHistory';
import { SeedPhotoMealProposal } from '../use-cases/SeedPhotoMealProposal';
import { DEFAULT_MAX_TOOL_TURNS, SendMessage } from '../use-cases/SendMessage';
import { AnalyticsSummaryTool } from '../use-cases/tools/AnalyticsSummaryTool';
import { MealDataTool } from '../use-cases/tools/MealDataTool';
import { ProposeMealLogTool } from '../use-cases/tools/ProposeMealLogTool';

export function chatRoutes(): Router {
  const router = Router();

  const conversationRepository = new PrismaConversationRepository(prisma);
  const foodEntryRepository = new PrismaFoodEntryRepository(prisma);
  const llmChatPort = new SharedLlmChatAdapter(createLlmClient());

  const mealItemRepository = new PrismaMealItemRepository(prisma);
  const mealEventPublisher = new MealLoggedEventPublisher();
  const logMealEntries = new LogMealEntries(mealItemRepository, mealEventPublisher);
  const replaceMealSlotEntries = new ReplaceMealSlotEntries(mealItemRepository, mealEventPublisher);
  const getDaySummary = new GetDaySummary(mealItemRepository, new OnboardingPlanTargetsAdapter());
  const getLoggedMealTypesForDateRange = new GetLoggedMealTypesForDateRange(mealItemRepository);
  const mealDataTool = new MealDataTool(getDaySummary, getLoggedMealTypesForDateRange);

  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);
  const profilePort = new OnboardingPlanProfileAdapter(
    new GetUserProfile(userProfileRepository),
    new UpdateProfileMeasurements(userProfileRepository, planRepository),
  );
  const getBodyStats = new GetBodyStats(
    new PrismaBodyMeasurementRepository(prisma),
    new PrismaBodySilhouetteProfileRepository(prisma),
    profilePort,
  );
  const getMealAverages = new GetMealAverages(new PrismaMealLogReadModelRepository(prisma));
  const analyticsSummaryTool = new AnalyticsSummaryTool(getBodyStats, getMealAverages);

  const recognizeFromText = new RecognizeFromText(new LlmTextEstimator());
  const proposeMealLogTool = new ProposeMealLogTool(recognizeFromText, conversationRepository);

  const sendMessage = new SendMessage(
    llmChatPort,
    conversationRepository,
    [mealDataTool, analyticsSummaryTool, proposeMealLogTool],
    env.MAX_TOOL_TURNS ?? DEFAULT_MAX_TOOL_TURNS,
    env.MAX_CONTEXT_MESSAGES ?? DEFAULT_MAX_CONTEXT_MESSAGES,
  );
  const getConversationHistory = new GetConversationHistory(conversationRepository);
  const seedPhotoMealProposal = new SeedPhotoMealProposal(conversationRepository, foodEntryRepository);
  const confirmMealProposal = new ConfirmMealProposal(
    conversationRepository,
    logMealEntries,
    replaceMealSlotEntries,
  );

  const controller = new ChatController(
    sendMessage,
    getConversationHistory,
    seedPhotoMealProposal,
    confirmMealProposal,
  );

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
    chatRateLimiter,
    controller.handleSendMessage,
  );
  router.get('/:conversationId', authMiddleware, controller.handleGetConversationHistory);
  router.post('/:conversationId/proposals/photo', authMiddleware, controller.handleSeedPhotoProposal);
  router.post('/:conversationId/proposals/confirm', authMiddleware, controller.handleConfirmMealProposal);

  return router;
}
