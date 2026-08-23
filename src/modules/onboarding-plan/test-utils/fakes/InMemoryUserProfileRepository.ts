import type {
  CreateUserProfileInput,
  UpdateUserProfileInput,
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

  async update(input: UpdateUserProfileInput): Promise<UserProfile> {
    const existingProfile = this.profilesByUserId.get(input.userId);
    if (!existingProfile) {
      throw new Error(`UserProfile not found for userId=${input.userId}`);
    }

    const updatedProfile: UserProfile = {
      ...existingProfile,
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    };

    this.profilesByUserId.set(input.userId, updatedProfile);
    return updatedProfile;
  }
}
