import type { AnalyticsUserProfile } from '../domain/bodyAnalyticsTypes';
import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { GetMeasurementTrend } from './GetMeasurementTrend';

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

describe('GetMeasurementTrend', () => {
  it('returns ordered points and a healthy delta flag', async () => {
    const repository = new InMemoryBodyMeasurementRepository();
    await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 80,
      unit: 'kg',
      date: new Date('2026-08-20T00:00:00.000Z'),
      source: 'manual',
    });
    await repository.create({
      userId: 'user-1',
      metric: 'weight',
      value: 79,
      unit: 'kg',
      date: new Date('2026-08-24T00:00:00.000Z'),
      source: 'manual',
    });
    const useCase = new GetMeasurementTrend(repository, new FakeOnboardingPlanProfilePort(profile));

    const result = await useCase.execute('user-1', 'weight', '1W');
    expect(result.current).toBe(79);
    expect(result.deltaIsGood).toBe(true);
    expect(result.points).toHaveLength(2);
  });
});
