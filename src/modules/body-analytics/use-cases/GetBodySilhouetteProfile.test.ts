import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { AnalyticsUserProfile, BodySilhouetteProfileRecord } from '../domain/bodyAnalyticsTypes';
import type { BodySilhouetteProfileRepositoryPort, UpdateBodySilhouetteProfileInput } from '../ports/BodySilhouetteProfileRepositoryPort';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { GetBodySilhouetteProfile } from './GetBodySilhouetteProfile';

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

function baseProfile(overrides: Partial<AnalyticsUserProfile> = {}): AnalyticsUserProfile {
  return {
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
    ...overrides,
  };
}

describe('GetBodySilhouetteProfile', () => {
  it('throws NOT_ONBOARDED when there is no onboarding profile', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new FakeBodySilhouetteProfileRepository(),
      new FakeOnboardingPlanProfilePort(null),
    );

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('falls back to the onboarding tape measurements when the silhouette profile is empty', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new FakeBodySilhouetteProfileRepository(null),
      new FakeOnboardingPlanProfilePort(
        baseProfile({ waistCm: 88, neckCm: 40, shoulderCm: 118, hipCm: null }),
      ),
    );

    await expect(useCase.execute('user-1')).resolves.toEqual({
      heightCm: 180,
      neckCm: 40,
      shoulderCm: 118,
      waistCm: 88,
      hipCm: null,
      sex: 'male',
    });
  });

  it('prefers a silhouette-profile value over the onboarding one, per region', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new FakeBodySilhouetteProfileRepository({
        userId: 'user-1',
        neckCm: null,
        shoulderCm: null,
        waistCm: 92, // edited on the Analytics tab
        hipCm: null,
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
      new FakeOnboardingPlanProfilePort(baseProfile({ waistCm: 88, neckCm: 40 })),
    );

    const result = await useCase.execute('user-1');
    expect(result.waistCm).toBe(92); // silhouette wins
    expect(result.neckCm).toBe(40); // onboarding fallback
  });
});
