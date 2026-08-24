import { CompleteOnboarding } from '../../../onboarding-plan/use-cases/CompleteOnboarding';
import { InMemoryPlanRepository } from '../../../onboarding-plan/test-utils/fakes/InMemoryPlanRepository';
import { InMemoryUserProfileRepository } from '../../../onboarding-plan/test-utils/fakes/InMemoryUserProfileRepository';
import { UpdatePlan } from '../../../onboarding-plan/use-cases/UpdatePlan';
import { OnboardingPlanUpdateAdapter } from './OnboardingPlanUpdateAdapter';

describe('OnboardingPlanUpdateAdapter', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('delegates to onboarding-plan UpdatePlan through the public use-case', async () => {
    const userProfileRepository = new InMemoryUserProfileRepository();
    const planRepository = new InMemoryPlanRepository();

    const completeOnboarding = new CompleteOnboarding(userProfileRepository, planRepository);
    await completeOnboarding.execute({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });

    const updatePlan = new UpdatePlan(userProfileRepository, planRepository);
    const adapter = new OnboardingPlanUpdateAdapter(updatePlan);

    const updatedPlan = await adapter.update('user-1', { weeklyPaceKg: 0.75 });

    expect(updatedPlan).toMatchObject({
      userId: 'user-1',
      dailyCalories: 1623,
      proteinG: 160,
      carbsG: 123,
      fatG: 55,
      projection: {
        startWeightKg: 80,
        targetWeightKg: 72,
        estimatedTargetDate: new Date('2026-11-08T00:00:00.000Z'),
      },
    });
    expect(planRepository.count()).toBe(1);
  });
});
