import { randomUUID } from 'node:crypto';
import type { CreateUserInput, UpdateUserProfileInput, User, UserRepositoryPort } from '../../ports/UserRepositoryPort';

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

  async findByGoogleSub(googleSub: string): Promise<User | null> {
    for (const user of this.usersById.values()) {
      if (user.googleSub === googleSub) {
        return user;
      }
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const user: User = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash ?? null,
      googleSub: input.googleSub ?? null,
      name: input.name ?? null,
      username: input.username ?? null,
      bio: input.bio ?? null,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: new Date(),
    };
    this.usersById.set(user.id, user);
    return user;
  }

  async linkGoogleAccount(id: string, googleSub: string): Promise<User> {
    const existing = this.usersById.get(id);
    if (!existing) {
      throw new Error('User not found');
    }
    const updated: User = { ...existing, googleSub };
    this.usersById.set(id, updated);
    return updated;
  }

  async updateProfile(input: UpdateUserProfileInput): Promise<User> {
    const existing = this.usersById.get(input.id);
    if (!existing) {
      throw new Error('User not found');
    }

    const updated: User = {
      ...existing,
      name: input.name === undefined ? existing.name : input.name,
      username: input.username === undefined ? existing.username : input.username,
      bio: input.bio === undefined ? existing.bio : input.bio,
      avatarUrl: input.avatarUrl === undefined ? existing.avatarUrl : input.avatarUrl,
    };
    this.usersById.set(updated.id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    this.usersById.delete(id);
  }
}
