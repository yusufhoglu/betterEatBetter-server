import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { InMemoryPlanRepository } from '../test-utils/fakes/InMemoryPlanRepository';
import { InMemoryUserProfileRepository } from '../test-utils/fakes/InMemoryUserProfileRepository';
import { CompleteOnboarding, type CompleteOnboardingInput } from './CompleteOnboarding';
import { UpdateProfileMeasurements } from './UpdateProfileMeasurements';

function buildInput(overrides: Partial<CompleteOnboardingInput> = {}): CompleteOnboardingInput {
  return {
    userId: 'user-1',
    weightKg: 80,
    targetWeightKg: 72,
    heightCm: 180,
    age: 30,
    gender: 'male',
    workoutsPerWeek: 3,
    goal: 'lose',
    weeklyPaceKg: 0.5,
    ...overrides,
  };
}

function buildUpdateProfileMeasurements() {
  const userProfileRepository = new InMemoryUserProfileRepository();
  const planRepository = new InMemoryPlanRepository();
  const completeOnboarding = new CompleteOnboarding(userProfileRepository, planRepository);
  const updateProfileMeasurements = new UpdateProfileMeasurements(userProfileRepository, planRepository);
  return { userProfileRepository, planRepository, completeOnboarding, updateProfileMeasurements };
}

describe('UpdateProfileMeasurements', () => {
  test('throws NOT_ONBOARDED when the user has no profile', async () => {
    const { updateProfileMeasurements } = buildUpdateProfileMeasurements();

    await expect(updateProfileMeasurements.execute('user-1', { heightCm: 182 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProfileMeasurements.execute('user-1', { heightCm: 182 })).rejects.toMatchObject({
      code: 'NOT_ONBOARDED',
    });
  });

  test('merges height and gender changes and recalculates the existing plan', async () => {
    const { completeOnboarding, updateProfileMeasurements, userProfileRepository, planRepository } =
      buildUpdateProfileMeasurements();

    await completeOnboarding.execute(buildInput());
    const updatedProfile = await updateProfileMeasurements.execute('user-1', {
      heightCm: 184,
      gender: 'female',
    });
    const storedProfile = await userProfileRepository.findByUserId('user-1');
    const storedPlan = await planRepository.findByUserId('user-1');

    expect(updatedProfile).toMatchObject({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 184,
      gender: 'female',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.5,
    });
    expect(storedProfile).toMatchObject({
      initialWeightKg: 80,
      heightCm: 184,
      gender: 'female',
    });
    expect(storedPlan).toMatchObject({
      dailyCalories: 1704,
      proteinG: 160,
      carbsG: 133,
      fatG: 59,
    });
  });
});
