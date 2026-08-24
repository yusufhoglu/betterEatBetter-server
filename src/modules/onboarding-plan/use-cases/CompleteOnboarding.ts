import { ConflictError } from '../../../shared/errors/ConflictError';
import { computePlan, type Gender, type Goal } from '../../../shared/domain/PlanCalculationService';
import { createModuleLogger } from '../../../shared/observability/logger';
import { BuildPlanResponse, type EnrichedPlan } from '../domain/BuildPlanResponse';
import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

const logger = createModuleLogger('complete-onboarding');

export interface CompleteOnboardingInput {
  userId: string;
  weightKg: number;
  targetWeightKg?: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
}

/**
 * First-time onboarding only — no upsert. Weight/goal changes after this point
 * are goal-management/UpdateGoal's responsibility, not this use-case's
 * (onboarding-plan-rule.md).
 */
export class CompleteOnboarding {
  constructor(
    private readonly userProfileRepository: UserProfileRepositoryPort,
    private readonly planRepository: PlanRepositoryPort,
  ) {}

  async execute(input: CompleteOnboardingInput): Promise<EnrichedPlan> {
    logger.info({ userId: input.userId }, 'checking existing onboarding profile');
    const existingProfile = await this.userProfileRepository.findByUserId(input.userId);
    if (existingProfile) {
      logger.warn({ userId: input.userId }, 'onboarding rejected because profile already exists');
      throw new ConflictError('ALREADY_ONBOARDED', 'User has already completed onboarding');
    }

    logger.info({ userId: input.userId }, 'creating onboarding profile');
    const profile = await this.userProfileRepository.create({
      userId: input.userId,
      weightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg ?? null,
      initialWeightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      gender: input.gender,
      workoutsPerWeek: input.workoutsPerWeek,
      goal: input.goal,
      weeklyPaceKg: input.weeklyPaceKg,
    });

    logger.info({ userId: input.userId }, 'computing onboarding plan');
    const { dailyCalories, proteinG, carbsG, fatG } = computePlan({
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      gender: input.gender,
      workoutsPerWeek: input.workoutsPerWeek,
      goal: input.goal,
      weeklyPaceKg: input.weeklyPaceKg,
    });

    logger.info({ userId: input.userId }, 'persisting onboarding plan');
    const plan = await this.planRepository.create({
      userId: input.userId,
      dailyCalories,
      proteinG,
      carbsG,
      fatG,
    });

    logger.info({ userId: input.userId }, 'building onboarding response');
    return BuildPlanResponse(profile, plan);
  }
}
