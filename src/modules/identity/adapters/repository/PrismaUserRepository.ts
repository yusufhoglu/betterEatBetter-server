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
}
