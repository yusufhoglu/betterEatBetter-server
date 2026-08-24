import type { BodySilhouetteProfileRecord } from '../domain/bodyAnalyticsTypes';

export interface UpdateBodySilhouetteProfileInput {
  userId: string;
  neckCm?: number | null;
  shoulderCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
}

export interface BodySilhouetteProfileRepositoryPort {
  findByUserId(userId: string): Promise<BodySilhouetteProfileRecord | null>;
  upsert(input: UpdateBodySilhouetteProfileInput): Promise<BodySilhouetteProfileRecord>;
}
