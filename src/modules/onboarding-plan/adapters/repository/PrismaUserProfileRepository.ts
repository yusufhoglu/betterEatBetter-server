import type { PrismaClient } from '@prisma/client';
import type { Gender, Goal } from '../../../../shared/domain/PlanCalculationService';
import type {
  CreateUserProfileInput,
  UpdateUserProfileInput,
  UserProfile,
  UserProfileRepositoryPort,
} from '../../ports/UserProfileRepositoryPort';

interface UserProfileRow {
  userId: string;
  weightKg: number;
  targetWeightKg: number;
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
    const row = await this.db.userProfile.findUnique({ where: { userId } });
    return row ? toUserProfile(row) : null;
  }

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    const row = await this.db.userProfile.create({ data: input });
    return toUserProfile(row);
  }

  async update(input: UpdateUserProfileInput): Promise<UserProfile> {
    const row = await this.db.userProfile.update({
      where: { userId: input.userId },
      data: {
        weightKg: input.weightKg,
        targetWeightKg: input.targetWeightKg,
        workoutsPerWeek: input.workoutsPerWeek,
        goal: input.goal,
        weeklyPaceKg: input.weeklyPaceKg,
      },
    });
    return toUserProfile(row);
  }
}
