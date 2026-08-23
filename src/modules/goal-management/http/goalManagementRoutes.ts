import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaPlanRepository } from '../../onboarding-plan/adapters/repository/PrismaPlanRepository';
import { PrismaUserProfileRepository } from '../../onboarding-plan/adapters/repository/PrismaUserProfileRepository';
import { UpdatePlan } from '../../onboarding-plan/use-cases/UpdatePlan';
import { OnboardingPlanUpdateAdapter } from '../adapters/plan/OnboardingPlanUpdateAdapter';
import { UpdateGoal } from '../use-cases/UpdateGoal';
import { GoalManagementController } from './GoalManagementController';

export function goalManagementRoutes(): Router {
  const router = Router();

  const userProfileRepository = new PrismaUserProfileRepository(prisma);
  const planRepository = new PrismaPlanRepository(prisma);
  const updatePlan = new UpdatePlan(userProfileRepository, planRepository);
  const planUpdater = new OnboardingPlanUpdateAdapter(updatePlan);
  const updateGoal = new UpdateGoal(planUpdater);
  const controller = new GoalManagementController(updateGoal);

  router.patch('/goal', authMiddleware, controller.handleUpdateGoal);

  return router;
}
