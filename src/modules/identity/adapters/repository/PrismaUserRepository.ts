import { prisma } from '../../../../shared/persistence/db';
import type { CreateUserInput, User, UserRepositoryPort } from '../../ports/UserRepositoryPort';

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

  async deleteById(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.mealItem.deleteMany({ where: { userId: id } });
      await tx.foodEntry.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  }
}
