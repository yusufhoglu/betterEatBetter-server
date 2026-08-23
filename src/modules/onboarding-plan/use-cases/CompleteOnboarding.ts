import { ConflictError } from '../../../shared/errors/ConflictError';
import { computePlan, type Gender, type Goal } from '../../../shared/domain/PlanCalculationService';
import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';
import type { UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

export interface CompleteOnboardingInput {
  userId: string;
  weightKg: number;
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

  async execute(input: CompleteOnboardingInput): Promise<Plan> {
    const existingProfile = await this.userProfileRepository.findByUserId(input.userId);
    if (existingProfile) {
      throw new ConflictError('ALREADY_ONBOARDED', 'User has already completed onboarding');
    }

    await this.userProfileRepository.create({
      userId: input.userId,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      gender: input.gender,
      workoutsPerWeek: input.workoutsPerWeek,
      goal: input.goal,
      weeklyPaceKg: input.weeklyPaceKg,
    });

    const { dailyCalories, proteinG, carbsG, fatG } = computePlan({
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      gender: input.gender,
      workoutsPerWeek: input.workoutsPerWeek,
      goal: input.goal,
      weeklyPaceKg: input.weeklyPaceKg,
    });

    return this.planRepository.create({
      userId: input.userId,
      dailyCalories,
      proteinG,
      carbsG,
      fatG,
    });
  }
}
