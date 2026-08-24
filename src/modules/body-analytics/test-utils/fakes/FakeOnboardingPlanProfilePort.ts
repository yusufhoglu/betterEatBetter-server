import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { AnalyticsUserProfile } from '../../domain/bodyAnalyticsTypes';
import type { ProfilePort, UpdateProfileMeasurementsInput } from '../../ports/ProfilePort';

export class FakeOnboardingPlanProfilePort implements ProfilePort {
  public updateCalls: Array<{ userId: string; changes: UpdateProfileMeasurementsInput }> = [];

  constructor(private profile: AnalyticsUserProfile | null) {}

  async getUserProfile(): Promise<AnalyticsUserProfile | null> {
    return this.profile;
  }

  async updateProfileMeasurements(userId: string, changes: UpdateProfileMeasurementsInput): Promise<AnalyticsUserProfile> {
    if (!this.profile) {
      throw new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    }

    this.updateCalls.push({ userId, changes });
    this.profile = {
      ...this.profile,
      heightCm: changes.heightCm ?? this.profile.heightCm,
      gender: changes.gender ?? this.profile.gender,
    };

    return this.profile;
  }
}
