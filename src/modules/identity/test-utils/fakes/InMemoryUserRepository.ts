import { randomUUID } from 'node:crypto';
import type { CreateUserInput, User, UserRepositoryPort } from '../../ports/UserRepositoryPort';

export class InMemoryUserRepository implements UserRepositoryPort {
  private readonly usersById = new Map<string, User>();

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.usersById.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    this.usersById.set(user.id, user);
    return user;
  }

  async deleteById(id: string): Promise<void> {
    this.usersById.delete(id);
  }
}
