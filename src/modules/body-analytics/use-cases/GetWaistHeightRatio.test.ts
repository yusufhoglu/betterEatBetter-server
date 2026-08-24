import type { BodySilhouetteProfileRecord } from '../domain/bodyAnalyticsTypes';
import type { BodySilhouetteProfileRepositoryPort } from '../ports/BodySilhouetteProfileRepositoryPort';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { GetWaistHeightRatio } from './GetWaistHeightRatio';

class FakeRepository implements BodySilhouetteProfileRepositoryPort {
  constructor(private readonly profile: BodySilhouetteProfileRecord | null) {}

  async findByUserId(): Promise<BodySilhouetteProfileRecord | null> {
    return this.profile;
  }

  async upsert(): Promise<BodySilhouetteProfileRecord> {
    throw new Error('not used');
  }
}

describe('GetWaistHeightRatio', () => {
  it('computes ratio and classification', async () => {
    const useCase = new GetWaistHeightRatio(
      new FakeRepository({
        userId: 'user-1',
        neckCm: null,
        shoulderCm: null,
        waistCm: 86,
        hipCm: null,
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
      new FakeOnboardingPlanProfilePort({
        userId: 'user-1',
        weightKg: 80,
        targetWeightKg: 72,
        initialWeightKg: 80,
        heightCm: 180,
        age: 30,
        gender: 'male',
        workoutsPerWeek: 3,
        goal: 'lose',
        weeklyPaceKg: 0.5,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    );

    await expect(useCase.execute('user-1')).resolves.toEqual({ ratio: 0.48, classification: 'low' });
  });
});
