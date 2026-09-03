import type { Gender, Goal } from '../../../shared/domain/PlanCalculationService';

export interface UserProfile {
  userId: string;
  weightKg: number;
  targetWeightKg: number | null;
  initialWeightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
  // Optional onboarding tape measurements (cm) — drive the Navy body-fat estimate.
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
  shoulderCm: number | null;
  createdAt: Date;
}

export interface CreateUserProfileInput {
  userId: string;
  weightKg: number;
  targetWeightKg: number | null;
  initialWeightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
}

export interface UpdateUserProfileInput {
  userId: string;
  weightKg?: number;
  targetWeightKg?: number | null;
  heightCm?: number;
  age?: number;
  gender?: Gender;
  workoutsPerWeek?: number;
  goal?: Goal;
  weeklyPaceKg?: number;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
}

export interface UserProfileRepositoryPort {
  findByUserId(userId: string): Promise<UserProfile | null>;
  create(input: CreateUserProfileInput): Promise<UserProfile>;
  update(input: UpdateUserProfileInput): Promise<UserProfile>;
}
