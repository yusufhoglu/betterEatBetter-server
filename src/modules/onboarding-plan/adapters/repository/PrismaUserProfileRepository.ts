import type { PrismaClient } from '@prisma/client';
import type { Gender, Goal } from '../../../../shared/domain/PlanCalculationService';
import { createModuleLogger } from '../../../../shared/observability/logger';
import type {
  CreateUserProfileInput,
  UpdateUserProfileInput,
  UserProfile,
  UserProfileRepositoryPort,
} from '../../ports/UserProfileRepositoryPort';

const logger = createModuleLogger('prisma-user-profile-repository');

interface UserProfileRow {
  userId: string;
  weightKg: number;
  targetWeightKg: number | null;
  initialWeightKg: number;
  heightCm: number;
  age: number;
  gender: string;
  workoutsPerWeek: number;
  goal: string;
  weeklyPaceKg: number;
  createdAt: Date;
}

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.userId,
    weightKg: row.weightKg,
    targetWeightKg: row.targetWeightKg,
    initialWeightKg: row.initialWeightKg,
    heightCm: row.heightCm,
    age: row.age,
    gender: row.gender as Gender,
    workoutsPerWeek: row.workoutsPerWeek,
    goal: row.goal as Goal,
    weeklyPaceKg: row.weeklyPaceKg,
    createdAt: row.createdAt,
  };
}

export class PrismaUserProfileRepository implements UserProfileRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    logger.info({ userId }, 'querying user profile by userId');
    const row = await this.db.userProfile.findUnique({ where: { userId } });
    logger.info({ userId, found: row !== null }, 'queried user profile by userId');
    return row ? toUserProfile(row) : null;
  }

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    logger.info({ userId: input.userId }, 'creating user profile');
    const row = await this.db.userProfile.create({ data: input });
    logger.info({ userId: input.userId }, 'created user profile');
    return toUserProfile(row);
  }

  async update(input: UpdateUserProfileInput): Promise<UserProfile> {
    logger.info({ userId: input.userId }, 'updating user profile');
    const row = await this.db.userProfile.update({
      where: { userId: input.userId },
      data: {
        weightKg: input.weightKg,
        targetWeightKg: input.targetWeightKg,
        heightCm: input.heightCm,
        age: input.age,
        gender: input.gender,
        workoutsPerWeek: input.workoutsPerWeek,
        goal: input.goal,
        weeklyPaceKg: input.weeklyPaceKg,
      },
    });
    logger.info({ userId: input.userId }, 'updated user profile');
    return toUserProfile(row);
  }
}
