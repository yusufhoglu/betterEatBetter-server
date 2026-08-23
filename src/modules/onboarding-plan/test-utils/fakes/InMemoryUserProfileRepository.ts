import type {
  CreateUserProfileInput,
  UserProfile,
  UserProfileRepositoryPort,
} from '../../ports/UserProfileRepositoryPort';

export class InMemoryUserProfileRepository implements UserProfileRepositoryPort {
  private readonly profilesByUserId = new Map<string, UserProfile>();

  async findByUserId(userId: string): Promise<UserProfile | null> {
    return this.profilesByUserId.get(userId) ?? null;
  }

  async create(input: CreateUserProfileInput): Promise<UserProfile> {
    const profile: UserProfile = { ...input, createdAt: new Date() };
    this.profilesByUserId.set(input.userId, profile);
    return profile;
  }
}
