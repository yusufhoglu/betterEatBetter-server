import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { FakeDailyTrackingPort } from '../test-utils/fakes/FakeDailyTrackingPort';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { GetGoalProgress } from './GetGoalProgress';

describe('GetGoalProgress', () => {
  it('includes the daily-tracking streak in the response', async () => {
    const measurements = new InMemoryBodyMeasurementRepository();
    await measurements.create({
      userId: 'user-1',
      metric: 'weight',
      value: 77,
      unit: 'kg',
      date: new Date('2026-08-24T00:00:00.000Z'),
      source: 'manual',
    });
    const useCase = new GetGoalProgress(
      measurements,
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
      new FakeDailyTrackingPort({
        date: '2026-08-24',
        completed: true,
        currentStreak: 12,
        longestStreak: 20,
      }),
    );

    const result = await useCase.execute('user-1');
    expect(result.streakDays).toBe(12);
    expect(result.progressFraction).toBeCloseTo(0.375);
  });
});
