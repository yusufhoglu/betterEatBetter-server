import { ComputeHealthScore } from './ComputeHealthScore';

describe('ComputeHealthScore', () => {
  test('rewards balanced inputs with a higher score', () => {
    const score = ComputeHealthScore({
      weightKg: 78,
      targetWeightKg: 72,
      heightCm: 180,
      age: 30,
      workoutsPerWeek: 4,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });

    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('penalizes aggressive pace and extreme distance from target weight', () => {
    const score = ComputeHealthScore({
      weightKg: 120,
      targetWeightKg: 75,
      heightCm: 170,
      age: 52,
      workoutsPerWeek: 0,
      goal: 'lose',
      weeklyPaceKg: 1.2,
    });

    expect(score).toBeLessThan(60);
  });
});
