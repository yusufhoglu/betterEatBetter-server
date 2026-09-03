import type { AnalyticsUserProfile } from '../domain/bodyAnalyticsTypes';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { GetWaistHeightRatio } from './GetWaistHeightRatio';

function buildProfilePort(overrides: Partial<AnalyticsUserProfile> = {}) {
  return new FakeOnboardingPlanProfilePort({
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
  });
}

describe('GetWaistHeightRatio', () => {
  it('computes ratio and classification from the latest waist measurement', async () => {
    const useCase = new GetWaistHeightRatio(
      new InMemoryBodyMeasurementRepository([
        {
          id: 'waist-1',
          userId: 'user-1',
          metric: 'waist',
          value: 86,
          unit: 'cm',
          date: new Date('2026-09-01T00:00:00.000Z'),
          source: 'manual',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ]),
      buildProfilePort(),
    );

    await expect(useCase.execute('user-1')).resolves.toEqual({ ratio: 0.48, classification: 'low' });
  });

  it('falls back to the onboarding seed when no waist measurement exists', async () => {
    const useCase = new GetWaistHeightRatio(
      new InMemoryBodyMeasurementRepository(),
      buildProfilePort({ waistCm: 86 }),
    );

    await expect(useCase.execute('user-1')).resolves.toEqual({ ratio: 0.48, classification: 'low' });
  });

  it('returns nulls when nothing is known', async () => {
    const useCase = new GetWaistHeightRatio(new InMemoryBodyMeasurementRepository(), buildProfilePort());

    await expect(useCase.execute('user-1')).resolves.toEqual({ ratio: null, classification: null });
  });
});
