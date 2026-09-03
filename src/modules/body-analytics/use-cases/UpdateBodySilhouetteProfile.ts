import type { BodyMeasurementMetric } from '../domain/bodyAnalyticsTypes';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import type { ProfilePort } from '../ports/ProfilePort';
import { GetBodySilhouetteProfile } from './GetBodySilhouetteProfile';

export interface UpdateBodySilhouetteProfileInput {
  heightCm?: number;
  neckCm?: number | null;
  shoulderCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  sex?: 'male' | 'female';
}

/**
 * Editing a region on the Analytics tab is a new measurement event: it appends a
 * body_measurements row (the source of truth) and pushes the value onto the
 * onboarding profile via ProfilePort, which recalculates the plan. height/sex go
 * to onboarding-plan the same way. Both writes run in sequence — no transaction,
 * matching the simplicity accepted elsewhere in the codebase.
 */
export class UpdateBodySilhouetteProfile {
  constructor(
    private readonly measurementRepository: BodyMeasurementRepositoryPort,
    private readonly profilePort: ProfilePort,
  ) {}

  async execute(userId: string, input: UpdateBodySilhouetteProfileInput) {
    const candidates: Array<{ metric: BodyMeasurementMetric; value: number | null | undefined }> = [
      { metric: 'neck', value: input.neckCm },
      { metric: 'shoulder', value: input.shoulderCm },
      { metric: 'waist', value: input.waistCm },
      { metric: 'hip', value: input.hipCm },
    ];
    const circumferences = candidates.filter(
      (entry): entry is { metric: BodyMeasurementMetric; value: number } => typeof entry.value === 'number',
    );

    if (
      input.heightCm !== undefined ||
      input.sex !== undefined ||
      circumferences.length > 0
    ) {
      await this.profilePort.updateProfileMeasurements(userId, {
        heightCm: input.heightCm,
        gender: input.sex,
        neckCm: input.neckCm ?? undefined,
        shoulderCm: input.shoulderCm ?? undefined,
        waistCm: input.waistCm ?? undefined,
        hipCm: input.hipCm ?? undefined,
      });
    }

    const now = new Date();
    for (const { metric, value } of circumferences) {
      await this.measurementRepository.create({
        userId,
        metric,
        value,
        unit: 'cm',
        date: now,
        source: 'manual',
      });
    }

    return new GetBodySilhouetteProfile(this.measurementRepository, this.profilePort).execute(userId);
  }
}
