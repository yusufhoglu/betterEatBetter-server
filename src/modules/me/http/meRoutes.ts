import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaUserRepository } from '../../identity/adapters/repository/PrismaUserRepository';
import { GetUserAccountProfile } from '../../identity/use-cases/GetUserAccountProfile';
import { UpdateUserAccountProfile } from '../../identity/use-cases/UpdateUserAccountProfile';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { GetActivePlan } from '../../onboarding-plan/use-cases/GetActivePlan';
import { GetUserProfile } from '../../onboarding-plan/use-cases/GetUserProfile';
import { UpdatePlan } from '../../onboarding-plan/use-cases/UpdatePlan';
import { UpdateProfileMeasurements } from '../../onboarding-plan/use-cases/UpdateProfileMeasurements';
import { PrismaSubscriptionRepository } from '../../subscription/adapters/repository/PrismaSubscriptionRepository';
import { GetSubscriptionEntitlement } from '../../subscription/use-cases/GetSubscriptionEntitlement';
import { PrismaMeCatalogRepository } from '../adapters/repository/PrismaMeCatalogRepository';
import { PrismaMePreferencesRepository } from '../adapters/repository/PrismaMePreferencesRepository';
import { SaveDieticianRecipe } from '../use-cases/SaveDieticianRecipe';
import { MeController } from './MeController';

export function meRoutes(): Router {
  const router = Router();

  const userRepository = new PrismaUserRepository();
  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);
  const catalogRepository = new PrismaMeCatalogRepository(prisma);
  const controller = new MeController(
    new GetUserAccountProfile(userRepository),
    new UpdateUserAccountProfile(userRepository),
    new GetUserProfile(userProfileRepository),
    new GetActivePlan(planRepository),
    new UpdatePlan(userProfileRepository, planRepository),
    new UpdateProfileMeasurements(userProfileRepository, planRepository),
    new GetSubscriptionEntitlement(new PrismaSubscriptionRepository(prisma)),
    catalogRepository,
    new PrismaMePreferencesRepository(prisma),
    new SaveDieticianRecipe(catalogRepository),
  );

  router.get('/profile', authMiddleware, controller.handleGetProfile);
  router.patch('/profile', authMiddleware, controller.handlePatchProfile);
  router.get('/goal', authMiddleware, controller.handleGetGoal);
  router.patch('/goal', authMiddleware, controller.handlePatchGoal);
  router.post('/goal/preview-calories', authMiddleware, controller.handlePreviewGoalCalories);
  router.get('/notification-preferences', authMiddleware, controller.handleGetNotificationPreferences);
  router.patch('/notification-preferences', authMiddleware, controller.handlePatchNotificationPreferences);
  router.get('/unit-preferences', authMiddleware, controller.handleGetUnitPreferences);
  router.patch('/unit-preferences', authMiddleware, controller.handlePatchUnitPreferences);
  router.get('/favorite-recipes', authMiddleware, controller.handleGetFavoriteRecipes);
  router.post('/favorite-recipes', authMiddleware, controller.handlePostFavoriteRecipe);
  router.delete('/favorite-recipes/:id', authMiddleware, controller.handleDeleteFavoriteRecipe);
  router.get('/my-meals', authMiddleware, controller.handleGetMyMeals);
  router.post('/my-meals', authMiddleware, controller.handlePostMyMeal);
  router.patch('/my-meals/:id', authMiddleware, controller.handlePatchMyMeal);
  router.delete('/my-meals/:id', authMiddleware, controller.handleDeleteMyMeal);
  router.get('/saved-recipes', authMiddleware, controller.handleGetSavedRecipes);
  router.post('/saved-recipes', authMiddleware, controller.handlePostSavedRecipe);
  router.patch('/saved-recipes/:id', authMiddleware, controller.handlePatchSavedRecipe);
  router.delete('/saved-recipes/:id', authMiddleware, controller.handleDeleteSavedRecipe);
  router.get('/subscription/plans', authMiddleware, controller.handleGetSubscriptionPlans);

  return router;
}
