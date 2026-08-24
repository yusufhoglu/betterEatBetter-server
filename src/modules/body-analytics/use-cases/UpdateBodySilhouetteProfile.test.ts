import type { BodySilhouetteProfileRecord } from '../domain/bodyAnalyticsTypes';
import type { BodySilhouetteProfileRepositoryPort, UpdateBodySilhouetteProfileInput } from '../ports/BodySilhouetteProfileRepositoryPort';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { UpdateBodySilhouetteProfile } from './UpdateBodySilhouetteProfile';

class FakeBodySilhouetteProfileRepository implements BodySilhouetteProfileRepositoryPort {
  constructor(private profile: BodySilhouetteProfileRecord | null = null) {}

  async findByUserId(): Promise<BodySilhouetteProfileRecord | null> {
    return this.profile;
  }

  async upsert(input: UpdateBodySilhouetteProfileInput): Promise<BodySilhouetteProfileRecord> {
    this.profile = {
      userId: input.userId,
      neckCm: input.neckCm ?? null,
      shoulderCm: input.shoulderCm ?? null,
      waistCm: input.waistCm ?? null,
      hipCm: input.hipCm ?? null,
      updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    };
    return this.profile;
  }
}

describe('UpdateBodySilhouetteProfile', () => {
  it('delegates height updates to onboarding-plan', async () => {
    const profilePort = new FakeOnboardingPlanProfilePort({
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
    });
    const repository = new FakeBodySilhouetteProfileRepository();
    const useCase = new UpdateBodySilhouetteProfile(repository, profilePort);

    const result = await useCase.execute('user-1', { heightCm: 182, waistCm: 86 });
    expect(profilePort.updateCalls).toEqual([{ userId: 'user-1', changes: { heightCm: 182, gender: undefined } }]);
    expect(result.heightCm).toBe(182);
    expect(result.waistCm).toBe(86);
  });
});
