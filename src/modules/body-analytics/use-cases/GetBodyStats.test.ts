import type { AnalyticsUserProfile } from '../domain/bodyAnalyticsTypes';
import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { GetBodyStats } from './GetBodyStats';

const profile: AnalyticsUserProfile = {
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
};

describe('GetBodyStats', () => {
  // Freeze the clock so the use-case's trend windows keep covering the
  // late-August 2026 fixtures as real time moves on.
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-08-25T12:00:00.000Z'), doNotFake: ['nextTick'] });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns null fractions for body fat and waist while keeping weight goal-aware', async () => {
    const repository = new InMemoryBodyMeasurementRepository([
      {
        id: 'weight-1',
        userId: 'user-1',
        metric: 'weight',
        value: 79,
        unit: 'kg',
        date: new Date('2026-08-24T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
      {
        id: 'body-fat-1',
        userId: 'user-1',
        metric: 'bodyFat',
        value: 19,
        unit: '%',
        date: new Date('2026-08-24T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);
    const useCase = new GetBodyStats(repository, new FakeOnboardingPlanProfilePort(profile));

    const result = await useCase.execute('user-1');
    expect(result.bodyFat.fraction).toBeNull();
    expect(result.waist.fraction).toBeNull();
    expect(result.weight.trendIsGood).toBe(true);
  });

  it('falls back to the onboarding seed waist when no waist measurement exists', async () => {
    const repository = new InMemoryBodyMeasurementRepository();

    const useCase = new GetBodyStats(
      repository,
      new FakeOnboardingPlanProfilePort({ ...profile, waistCm: 86 }),
    );

    const result = await useCase.execute('user-1');

    expect(result.waist.value).toBe(86);
  });

  it('uses the onboarding goal inside the use-case when computing weight trendIsGood', async () => {
    const repository = new InMemoryBodyMeasurementRepository([
      {
        id: 'weight-1',
        userId: 'user-1',
        metric: 'weight',
        value: 79,
        unit: 'kg',
        date: new Date('2026-08-12T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
      },
      {
        id: 'weight-2',
        userId: 'user-1',
        metric: 'weight',
        value: 79.2,
        unit: 'kg',
        date: new Date('2026-08-15T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-15T00:00:00.000Z'),
      },
      {
        id: 'weight-3',
        userId: 'user-1',
        metric: 'weight',
        value: 80,
        unit: 'kg',
        date: new Date('2026-08-22T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-22T00:00:00.000Z'),
      },
      {
        id: 'weight-4',
        userId: 'user-1',
        metric: 'weight',
        value: 80.2,
        unit: 'kg',
        date: new Date('2026-08-24T00:00:00.000Z'),
        source: 'manual',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);
    const loseGoalUseCase = new GetBodyStats(
      repository,
      new FakeOnboardingPlanProfilePort({
        ...profile,
        goal: 'lose',
      }),
    );
    const gainGoalUseCase = new GetBodyStats(
      repository,
      new FakeOnboardingPlanProfilePort({
        ...profile,
        goal: 'gain',
      }),
    );

    const loseResult = await loseGoalUseCase.execute('user-1');
    const gainResult = await gainGoalUseCase.execute('user-1');

    expect(loseResult.weight.trendValue).toBeGreaterThan(0);
    expect(gainResult.weight.trendValue).toBe(loseResult.weight.trendValue);
    expect(loseResult.weight.trendIsGood).toBe(false);
    expect(gainResult.weight.trendIsGood).toBe(true);
    expect(loseResult.bmi.trendIsGood).toBe(false);
    expect(gainResult.bmi.trendIsGood).toBe(true);
  });
});
