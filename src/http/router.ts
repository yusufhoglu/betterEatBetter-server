// TODO: tum modul route'larini tek Express Router'da birlestirir -- is mantigi icermez
import { Router } from 'express';
import { identityRoutes } from '../modules/identity/http/identityRoutes';
import { onboardingRoutes } from '../modules/onboarding-plan/http/onboardingRoutes';
import { goalManagementRoutes } from '../modules/goal-management/http/goalManagementRoutes';
import { foodRecognitionRoutes } from '../modules/food-recognition/http/foodRecognitionRoutes';
import { mediaUploadRoutes } from '../modules/food-recognition/http/mediaUploadRoutes';
import { nutritionLoggingRoutes } from '../modules/nutrition-logging/http/nutritionLoggingRoutes';
import { dailyTrackingRoutes } from '../modules/daily-tracking/http/dailyTrackingRoutes';
import { bodyAnalyticsRoutes, bodyMeasurementRoutes } from '../modules/body-analytics/http/bodyAnalyticsRoutes';
import { chatRoutes } from '../modules/chatbot/http/chatRoutes';
import { meRoutes } from '../modules/me/http/meRoutes';
import { notificationsRoutes } from '../modules/notifications/http/notificationsRoutes';
import { subscriptionRoutes } from '../modules/subscription/http/subscriptionRoutes';

export function createRouter(): Router {
  const router = Router();

  router.use('/auth', identityRoutes());
  router.use('/onboarding', onboardingRoutes());
  router.use('/goal', goalManagementRoutes());
  router.use('/food', foodRecognitionRoutes());
  router.use('/media', mediaUploadRoutes());
  router.use('/nutrition-logs', nutritionLoggingRoutes());
  router.use('/tracking', dailyTrackingRoutes());
  router.use('/', meRoutes());
  router.use('/analytics', bodyAnalyticsRoutes());
  router.use('/body-measurements', bodyMeasurementRoutes());
  router.use('/chat', chatRoutes());
  router.use('/notifications', notificationsRoutes());
  router.use('/subscription', subscriptionRoutes());

  return router;
}
