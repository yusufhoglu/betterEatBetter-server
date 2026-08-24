import { ComputeWeightProjection } from './ComputeWeightProjection';

describe('ComputeWeightProjection', () => {
  test('returns a dated projection for lose or gain goals', () => {
    const projection = ComputeWeightProjection({
      startWeightKg: 80,
      targetWeightKg: 72,
      goal: 'lose',
      weeklyPaceKg: 0.5,
      referenceDate: new Date('2026-08-23T00:00:00.000Z'),
    });

    expect(projection).toEqual({
      startWeightKg: 80,
      targetWeightKg: 72,
      estimatedTargetDate: new Date('2026-12-13T00:00:00.000Z'),
    });
  });

  test('returns null when there is no remaining distance or the goal is maintain', () => {
    expect(
      ComputeWeightProjection({
        startWeightKg: 72,
        targetWeightKg: 72,
        goal: 'maintain',
        weeklyPaceKg: 0.5,
        referenceDate: new Date('2026-08-23T00:00:00.000Z'),
      }),
    ).toEqual({
      startWeightKg: 72,
      targetWeightKg: 72,
      estimatedTargetDate: null,
    });
  });
});
