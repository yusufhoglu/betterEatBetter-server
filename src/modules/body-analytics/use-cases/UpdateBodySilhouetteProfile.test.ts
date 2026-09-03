import { InMemoryBodyMeasurementRepository } from '../test-utils/fakes/InMemoryBodyMeasurementRepository';
import { FakeOnboardingPlanProfilePort } from '../test-utils/fakes/FakeOnboardingPlanProfilePort';
import { UpdateBodySilhouetteProfile } from './UpdateBodySilhouetteProfile';

function buildProfilePort() {
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
  });
}

describe('UpdateBodySilhouetteProfile', () => {
  it('pushes height and circumferences to onboarding-plan and appends measurement rows', async () => {
    const profilePort = buildProfilePort();
    const measurementRepository = new InMemoryBodyMeasurementRepository();
    const useCase = new UpdateBodySilhouetteProfile(measurementRepository, profilePort);

    const result = await useCase.execute('user-1', { heightCm: 182, waistCm: 86, neckCm: 39 });

    expect(profilePort.updateCalls).toEqual([
      {
        userId: 'user-1',
        changes: {
          heightCm: 182,
          gender: undefined,
          waistCm: 86,
          neckCm: 39,
          shoulderCm: undefined,
          hipCm: undefined,
        },
      },
    ]);

    const waistHistory = await measurementRepository.list({ userId: 'user-1', metric: 'waist' });
    const neckHistory = await measurementRepository.list({ userId: 'user-1', metric: 'neck' });
    expect(waistHistory).toHaveLength(1);
    expect(waistHistory[0]).toMatchObject({ metric: 'waist', value: 86, unit: 'cm', source: 'manual' });
    expect(neckHistory[0]).toMatchObject({ metric: 'neck', value: 39, unit: 'cm', source: 'manual' });

    expect(result.heightCm).toBe(182);
    expect(result.waistCm).toBe(86);
    expect(result.neckCm).toBe(39);
  });

  it('does not touch onboarding-plan or the log when nothing actionable is sent', async () => {
    const profilePort = buildProfilePort();
    const measurementRepository = new InMemoryBodyMeasurementRepository();
    const useCase = new UpdateBodySilhouetteProfile(measurementRepository, profilePort);

    await useCase.execute('user-1', {});

    expect(profilePort.updateCalls).toEqual([]);
    expect(await measurementRepository.list({ userId: 'user-1' })).toEqual([]);
  });
});
