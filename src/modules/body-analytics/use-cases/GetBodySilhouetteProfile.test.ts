import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { AnalyticsUserProfile, BodyMeasurement } from '../domain/bodyAnalyticsTypes';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { GetBodySilhouetteProfile } from './GetBodySilhouetteProfile';

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

function measurement(overrides: Partial<BodyMeasurement> & Pick<BodyMeasurement, 'metric' | 'value' | 'date'>): BodyMeasurement {
  return {
    id: `${overrides.metric}-${overrides.date.toISOString()}`,
    userId: 'user-1',
    unit: 'cm',
    source: 'manual',
    createdAt: overrides.date,
    ...overrides,
  };
}

describe('GetBodySilhouetteProfile', () => {
  it('throws NOT_ONBOARDED when there is no onboarding profile', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new InMemoryBodyMeasurementRepository(),
      new FakeOnboardingPlanProfilePort(null),
    );

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('falls back to the onboarding seed when no measurement has been logged', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new InMemoryBodyMeasurementRepository(),
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

  it('prefers the latest measurement over the onboarding seed, per region', async () => {
    const useCase = new GetBodySilhouetteProfile(
      new InMemoryBodyMeasurementRepository([
        measurement({ metric: 'waist', value: 90, date: new Date('2026-09-01T00:00:00.000Z') }),
        measurement({ metric: 'waist', value: 92, date: new Date('2026-09-10T00:00:00.000Z') }),
      ]),
      new FakeOnboardingPlanProfilePort(baseProfile({ waistCm: 88, neckCm: 40 })),
    );

    const result = await useCase.execute('user-1');
    expect(result.waistCm).toBe(92); // most recent measurement wins
    expect(result.neckCm).toBe(40); // onboarding seed fallback
  });
});
