import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaMealItemRepository } from '../../nutrition-logging/adapters/repository/PrismaMealItemRepository';
import { GetLoggedMealTypesForDateRange } from '../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import { DailyTrackingAdapter } from '../adapters/tracking/DailyTrackingAdapter';
import { NutritionLoggingDayLogsAdapter } from '../../daily-tracking/adapters/dayLogs/NutritionLoggingDayLogsAdapter';
import { GetTodayStatus } from '../../daily-tracking/use-cases/GetTodayStatus';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { GetActivePlan } from '../../onboarding-plan/use-cases/GetActivePlan';
import { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import { UpdateProfileMeasurements } from '../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import { TemplateInsightGenerator } from '../adapters/insights/TemplateInsightGenerator';
import { OnboardingPlanProfileAdapter } from '../adapters/profile/OnboardingPlanProfileAdapter';
import { PrismaBodyMeasurementRepository } from '../adapters/repository/PrismaBodyMeasurementRepository';
import { PrismaBodySilhouetteProfileRepository } from '../adapters/repository/PrismaBodySilhouetteProfileRepository';
import { PrismaMealLogReadModelRepository } from '../adapters/repository/PrismaMealLogReadModelRepository';
import { AddBodyMeasurement } from '../use-cases/AddBodyMeasurement';
import { DeleteBodyMeasurement } from '../use-cases/DeleteBodyMeasurement';
import { GetBodySilhouetteProfile } from '../use-cases/GetBodySilhouetteProfile';
import { GetBodyStats } from '../use-cases/GetBodyStats';
import { GetGoalProgress } from '../use-cases/GetGoalProgress';
import { GetMealAverages } from '../use-cases/GetMealAverages';
import { GetMealBreakdown } from '../use-cases/GetMealBreakdown';
import { GetMealCorrelation } from '../use-cases/GetMealCorrelation';
import { GetMealInsights } from '../use-cases/GetMealInsights';
import { GetMeasurementTrend } from '../use-cases/GetMeasurementTrend';
import { GetTopFoods } from '../use-cases/GetTopFoods';
import { GetWaistHeightRatio } from '../use-cases/GetWaistHeightRatio';
import { GetWeeklyMealTrend } from '../use-cases/GetWeeklyMealTrend';
import { ListBodyMeasurements } from '../use-cases/ListBodyMeasurements';
import { UpdateBodyMeasurement } from '../use-cases/UpdateBodyMeasurement';
import { UpdateBodySilhouetteProfile } from '../use-cases/UpdateBodySilhouetteProfile';
import { BodyAnalyticsController } from './BodyAnalyticsController';

function buildController(): BodyAnalyticsController {
  const bodyMeasurementRepository = new PrismaBodyMeasurementRepository(prisma);
  const silhouetteProfileRepository = new PrismaBodySilhouetteProfileRepository(prisma);
  const mealLogReadModelRepository = new PrismaMealLogReadModelRepository(prisma);
  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);

  const getUserProfile = new GetUserProfile(userProfileRepository);
  const updateProfileMeasurements = new UpdateProfileMeasurements(userProfileRepository, planRepository);
  const getActivePlan = new GetActivePlan(planRepository);
  const profilePort = new OnboardingPlanProfileAdapter(getUserProfile, updateProfileMeasurements);
  const planTargetPort = {
    getPlanTargets: (userId: string) => getActivePlan.execute(userId),
  };

  const mealItemRepository = new PrismaMealItemRepository(prisma);
  const getLoggedMealTypesForDateRange = new GetLoggedMealTypesForDateRange(mealItemRepository);
  const nutritionLoggingDayLogsAdapter = new NutritionLoggingDayLogsAdapter(getLoggedMealTypesForDateRange);
  const getTodayStatus = new GetTodayStatus(nutritionLoggingDayLogsAdapter);
  const dailyTrackingPort = new DailyTrackingAdapter(getTodayStatus);

  return new BodyAnalyticsController(
    new GetBodyStats(bodyMeasurementRepository, silhouetteProfileRepository, profilePort),
    new ListBodyMeasurements(bodyMeasurementRepository),
    new AddBodyMeasurement(bodyMeasurementRepository),
    new UpdateBodyMeasurement(bodyMeasurementRepository),
    new DeleteBodyMeasurement(bodyMeasurementRepository),
    new GetMeasurementTrend(bodyMeasurementRepository, profilePort),
    new GetBodySilhouetteProfile(silhouetteProfileRepository, profilePort),
    new UpdateBodySilhouetteProfile(silhouetteProfileRepository, profilePort),
    new GetWaistHeightRatio(silhouetteProfileRepository, profilePort),
    new GetGoalProgress(bodyMeasurementRepository, profilePort, dailyTrackingPort),
    new GetMealAverages(mealLogReadModelRepository),
    new GetWeeklyMealTrend(mealLogReadModelRepository, planTargetPort),
    new GetMealBreakdown(mealLogReadModelRepository),
    new GetTopFoods(mealLogReadModelRepository),
    new GetMealInsights(mealLogReadModelRepository, new TemplateInsightGenerator()),
    new GetMealCorrelation(mealLogReadModelRepository, bodyMeasurementRepository),
  );
}

export function bodyAnalyticsRoutes(): Router {
  const router = Router();
  const controller = buildController();

  router.get('/body-stats', authMiddleware, controller.handleGetBodyStats);
  router.get('/body-profile', authMiddleware, controller.handleGetBodyProfile);
  router.patch('/body-profile', authMiddleware, controller.handlePatchBodyProfile);
  router.get('/waist-height-ratio', authMiddleware, controller.handleGetWaistHeightRatio);
  router.get('/goal-progress', authMiddleware, controller.handleGetGoalProgress);
  router.get('/goal/progress', authMiddleware, controller.handleGetGoalProgress);
  router.get('/meals/averages', authMiddleware, controller.handleGetMealAverages);
  router.get('/meals/weekly', authMiddleware, controller.handleGetWeeklyMealTrend);
  router.get('/meals/breakdown', authMiddleware, controller.handleGetMealBreakdown);
  router.get('/meals/top-foods', authMiddleware, controller.handleGetTopFoods);
  router.get('/meals/insights', authMiddleware, controller.handleGetMealInsights);
  router.get('/meals/correlation', authMiddleware, controller.handleGetMealCorrelation);

  return router;
}

export function bodyMeasurementRoutes(): Router {
  const router = Router();
  const controller = buildController();

  router.get('/', authMiddleware, controller.handleListBodyMeasurements);
  router.post('/', authMiddleware, controller.handleAddBodyMeasurement);
  router.get('/trend', authMiddleware, controller.handleGetMeasurementTrend);
  router.patch('/:id', authMiddleware, controller.handleUpdateBodyMeasurement);
  router.delete('/:id', authMiddleware, controller.handleDeleteBodyMeasurement);

  return router;
}
