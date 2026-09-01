import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { InMemoryPlanRepository } from '../test-utils/fakes/InMemoryPlanRepository';
import { InMemoryUserProfileRepository } from '../test-utils/fakes/InMemoryUserProfileRepository';
import { CompleteOnboarding, type CompleteOnboardingInput } from './CompleteOnboarding';
import { UpdatePlan, type UpdatePlanChanges } from './UpdatePlan';

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

function buildUpdatePlan() {
  const userProfileRepository = new InMemoryUserProfileRepository();
  const planRepository = new InMemoryPlanRepository();
  const completeOnboarding = new CompleteOnboarding(userProfileRepository, planRepository);
  const updatePlan = new UpdatePlan(userProfileRepository, planRepository);
  return { userProfileRepository, planRepository, completeOnboarding, updatePlan };
}

describe('UpdatePlan', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('throws NotFoundError with NOT_ONBOARDED when the user has no profile', async () => {
    const { updatePlan } = buildUpdatePlan();

    await expect(updatePlan.execute('user-1', { weeklyPaceKg: 0.75 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updatePlan.execute('user-1', { weeklyPaceKg: 0.75 })).rejects.toMatchObject({
      code: 'NOT_ONBOARDED',
    });
  });

  test('recomputes the plan from the full profile while preserving untouched fields', async () => {
    const { completeOnboarding, updatePlan, userProfileRepository } = buildUpdatePlan();
    await completeOnboarding.execute(buildInput());

    const changes: UpdatePlanChanges = { weeklyPaceKg: 0.75 };
    const updatedPlan = await updatePlan.execute('user-1', changes);
    const storedProfile = await userProfileRepository.findByUserId('user-1');

    expect(storedProfile).toMatchObject({
      userId: 'user-1',
      weightKg: 80,
      targetWeightKg: 72,
      initialWeightKg: 80,
      heightCm: 180,
      age: 30,
      gender: 'male',
      workoutsPerWeek: 3,
      goal: 'lose',
      weeklyPaceKg: 0.75,
    });

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
  });

  test('persists manual macro overrides on top of the recalculated plan', async () => {
    const { completeOnboarding, updatePlan } = buildUpdatePlan();
    await completeOnboarding.execute(buildInput());

    const updatedPlan = await updatePlan.execute('user-1', {
      dailyCalories: 2100,
      proteinG: 180,
      carbsG: 190,
      fatG: 62,
    });

    expect(updatedPlan).toMatchObject({
      dailyCalories: 2100,
      proteinG: 180,
      carbsG: 190,
      fatG: 62,
    });
  });

  test('a single-macro edit keeps the other stored macro values', async () => {
    const { completeOnboarding, updatePlan } = buildUpdatePlan();
    await completeOnboarding.execute(buildInput());

    const first = await updatePlan.execute('user-1', {
      dailyCalories: 2100,
      proteinG: 180,
      carbsG: 190,
      fatG: 62,
    });

    // Tweak only carbs — protein / fat / calories must stay put, not reset to
    // whatever `computePlan` would produce.
    const second = await updatePlan.execute('user-1', { carbsG: 210 });

    expect(second).toMatchObject({
      dailyCalories: first.dailyCalories,
      proteinG: first.proteinG,
      carbsG: 210,
      fatG: first.fatG,
    });
  });

  test('a goal-parameter change still recomputes macros from the profile', async () => {
    const { completeOnboarding, updatePlan } = buildUpdatePlan();
    await completeOnboarding.execute(buildInput());

    await updatePlan.execute('user-1', {
      dailyCalories: 2100,
      proteinG: 180,
      carbsG: 190,
      fatG: 62,
    });

    // Changing the weekly pace is an explicit "recompute" — the earlier
    // overrides should not survive it.
    const recomputed = await updatePlan.execute('user-1', { weeklyPaceKg: 0.75 });

    expect(recomputed).toMatchObject({
      dailyCalories: 1623,
      proteinG: 160,
      carbsG: 123,
      fatG: 55,
    });
  });

  test('updates targetWeightKg without changing immutable initialWeightKg', async () => {
    const { completeOnboarding, updatePlan, userProfileRepository } = buildUpdatePlan();
    await completeOnboarding.execute(buildInput());

    const updatedPlan = await updatePlan.execute('user-1', { targetWeightKg: 68 });
    const storedProfile = await userProfileRepository.findByUserId('user-1');

    expect(updatedPlan.projection).toEqual({
      startWeightKg: 80,
      targetWeightKg: 68,
      estimatedTargetDate: new Date('2027-02-07T00:00:00.000Z'),
    });
    expect(storedProfile).toMatchObject({
      targetWeightKg: 68,
      initialWeightKg: 80,
    });
  });

  test('updates the existing plan row instead of creating a new one', async () => {
    const { completeOnboarding, updatePlan, planRepository } = buildUpdatePlan();
    const initialPlan = await completeOnboarding.execute(buildInput());

    expect(planRepository.count()).toBe(1);

    const updatedPlan = await updatePlan.execute('user-1', { weeklyPaceKg: 0.75 });

    expect(planRepository.count()).toBe(1);
    expect(updatedPlan.createdAt).toEqual(initialPlan.createdAt);
    expect(updatedPlan.updatedAt.getTime()).toBeGreaterThanOrEqual(initialPlan.updatedAt.getTime());
  });
});
