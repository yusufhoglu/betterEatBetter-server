import type { UserProfile, UserProfileRepositoryPort } from '../ports/UserProfileRepositoryPort';

/**
 * Stable public read entry point for modules that need the full onboarding
 * profile. Missing profile is represented as null, not an error.
 */
export class GetUserProfile {
  constructor(private readonly userProfileRepository: UserProfileRepositoryPort) {}

  async execute(userId: string): Promise<UserProfile | null> {
    return this.userProfileRepository.findByUserId(userId);
  }
}
