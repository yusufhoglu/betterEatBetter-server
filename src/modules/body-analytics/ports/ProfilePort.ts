import type { Gender } from '../../../shared/domain/PlanCalculationService';
import type { AnalyticsUserProfile } from '../domain/bodyAnalyticsTypes';

export interface UpdateProfileMeasurementsInput {
  heightCm?: number;
  gender?: Gender;
  // Circumferences the plan calculation reads. Passing one here updates the
  // onboarding profile and triggers a plan recalculation; body-analytics also
  // appends a body_measurements row so the history stays the source of truth.
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
}

export interface ProfilePort {
  getUserProfile(userId: string): Promise<AnalyticsUserProfile | null>;
  updateProfileMeasurements(userId: string, changes: UpdateProfileMeasurementsInput): Promise<AnalyticsUserProfile>;
}
