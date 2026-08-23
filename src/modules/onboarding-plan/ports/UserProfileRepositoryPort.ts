import type { Gender, Goal } from '../../../shared/domain/PlanCalculationService';

export interface UserProfile {
  userId: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
  createdAt: Date;
}

export interface CreateUserProfileInput {
  userId: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  workoutsPerWeek: number;
  goal: Goal;
  weeklyPaceKg: number;
}

export interface UserProfileRepositoryPort {
  findByUserId(userId: string): Promise<UserProfile | null>;
  create(input: CreateUserProfileInput): Promise<UserProfile>;
}
