import { autoStepTarget, autoWaterTargetMl, ComputeActivityTargets } from './ComputeActivityTargets';

describe('ComputeActivityTargets', () => {
  it('derives water from body weight, clamped and rounded', () => {
    expect(autoWaterTargetMl(64.8)).toBe(2100);
    expect(autoWaterTargetMl(35)).toBe(1500);
    expect(autoWaterTargetMl(150)).toBe(3500);
  });

  it('derives steps from training frequency', () => {
    expect(autoStepTarget(0)).toBe(7000);
    expect(autoStepTarget(3)).toBe(8000);
    expect(autoStepTarget(6)).toBe(10000);
  });

  it('prefers explicit overrides and reports which values are automatic', () => {
    expect(ComputeActivityTargets({ weightKg: 64.8, workoutsPerWeek: 3 }, { stepTarget: 10000, waterTargetMl: null })).toEqual({
      waterMl: 2100,
      steps: 10000,
      waterAuto: true,
      stepsAuto: false,
    });
  });
});
