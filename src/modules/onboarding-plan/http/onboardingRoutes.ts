import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaPlanRepository } from '../adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../adapters/repository/PrismaUserProfileRepository';
import { CompleteOnboarding } from '../use-cases/CompleteOnboarding';
import { OnboardingController } from './OnboardingController';

export function onboardingRoutes(): Router {
  const router = Router();

  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);
  const completeOnboarding = new CompleteOnboarding(userProfileRepository, planRepository);

  const controller = new OnboardingController(completeOnboarding);

  router.post('/complete', authMiddleware, controller.handleComplete);

  return router;
}
