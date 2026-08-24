import { prisma } from '../../../../shared/persistence/db';
import type { CreateUserInput, UpdateUserProfileInput, User, UserRepositoryPort } from '../../ports/UserRepositoryPort';

export class PrismaUserRepository implements UserRepositoryPort {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({ data: input });
  }

  async updateProfile(input: UpdateUserProfileInput): Promise<User> {
    return prisma.user.update({
      where: { id: input.id },
      data: {
        name: input.name,
        username: input.username,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
      },
    });
  }

  async deleteById(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { userId: id } });
      await tx.foodEntry.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  }
}
