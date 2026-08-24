import type { Gender } from '../../../shared/domain/PlanCalculationService';
import type { AnalyticsUserProfile } from '../domain/bodyAnalyticsTypes';

export interface UpdateProfileMeasurementsInput {
  heightCm?: number;
  gender?: Gender;
}

export interface ProfilePort {
  getUserProfile(userId: string): Promise<AnalyticsUserProfile | null>;
  updateProfileMeasurements(userId: string, changes: UpdateProfileMeasurementsInput): Promise<AnalyticsUserProfile>;
}
