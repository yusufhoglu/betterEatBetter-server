import { ConflictError } from '../../../shared/errors/ConflictError';
import { InMemoryPlanRepository } from '../test-utils/fakes/InMemoryPlanRepository';
import { InMemoryUserProfileRepository } from '../test-utils/fakes/InMemoryUserProfileRepository';
import { CompleteOnboarding, type CompleteOnboardingInput } from './CompleteOnboarding';

function buildCompleteOnboarding() {
  const userProfileRepository = new InMemoryUserProfileRepository();
  const planRepository = new InMemoryPlanRepository();
  const completeOnboarding = new CompleteOnboarding(userProfileRepository, planRepository);
  return { completeOnboarding, userProfileRepository, planRepository };
}

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

describe('CompleteOnboarding', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('CompleteOnboarding: fake port implementasyonlariyla (jest.mock() degil)', async () => {
    const { completeOnboarding, userProfileRepository, planRepository } = buildCompleteOnboarding();
    const input = buildInput();

    const plan = await completeOnboarding.execute(input);

    // PlanCalculationService.computePlan is called with the survey answers and the
    // result is exactly what gets persisted (see PlanCalculationService.test.ts for
    // the same inputs: dailyCalories 1898, proteinG 128, carbsG 203, fatG 64).
    expect(plan).toMatchObject({
      userId: 'user-1',
      dailyCalories: 1898,
      proteinG: 128,
      carbsG: 203,
      fatG: 64,
      projection: {
        startWeightKg: 80,
        targetWeightKg: 72,
        estimatedTargetDate: new Date('2026-12-13T00:00:00.000Z'),
      },
      healthScore: expect.any(Number),
      bodyFatPct: expect.any(Number),
      leanBodyMassKg: expect.any(Number),
    });

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
      weeklyPaceKg: 0.5,
    });

    const storedPlan = await planRepository.findByUserId('user-1');
    expect(storedPlan).toMatchObject({
      userId: plan.userId,
      dailyCalories: plan.dailyCalories,
      proteinG: plan.proteinG,
      carbsG: plan.carbsG,
      fatG: plan.fatG,
    });
  });

  test('throws ConflictError with ALREADY_ONBOARDED when the user already has a profile', async () => {
    const { completeOnboarding } = buildCompleteOnboarding();
    await completeOnboarding.execute(buildInput());

    await expect(completeOnboarding.execute(buildInput())).rejects.toMatchObject({
      code: 'ALREADY_ONBOARDED',
    });
  });

  test('throws ConflictError (not a generic Error) when re-onboarding', async () => {
    const { completeOnboarding } = buildCompleteOnboarding();
    await completeOnboarding.execute(buildInput());

    await expect(completeOnboarding.execute(buildInput())).rejects.toBeInstanceOf(ConflictError);
  });

  test('does not create a second plan row when re-onboarding is rejected', async () => {
    const { completeOnboarding, planRepository } = buildCompleteOnboarding();
    await completeOnboarding.execute(buildInput());

    await expect(completeOnboarding.execute(buildInput({ weightKg: 999 }))).rejects.toBeInstanceOf(ConflictError);

    const plan = await planRepository.findByUserId('user-1');
    expect(plan?.userId).toBe('user-1');
  });

  test('persists the optional tape measurements and uses a Navy body-fat estimate when they are present', async () => {
    const { completeOnboarding, userProfileRepository } = buildCompleteOnboarding();

    const withoutTape = buildCompleteOnboarding();
    const baseline = await withoutTape.completeOnboarding.execute(buildInput());

    const plan = await completeOnboarding.execute(
      buildInput({ waistCm: 90, neckCm: 40, shoulderCm: 120 }),
    );
    const storedProfile = await userProfileRepository.findByUserId('user-1');

    expect(storedProfile).toMatchObject({
      waistCm: 90,
      neckCm: 40,
      hipCm: null,
      shoulderCm: 120,
    });
    // shoulder ÷ waist, carried on the response but not part of the plan.
    expect(plan.shoulderToWaistRatio).toBeCloseTo(120 / 90, 2);
    // Navy (waist/neck) lands on a different body-fat figure than the
    // Deurenberg fallback, so the macro split shifts too.
    expect(plan.bodyFatPct).not.toBe(baseline.bodyFatPct);
    expect(plan.proteinG).not.toBe(baseline.proteinG);
  });

  test('stores the tape measurements as null when the step is skipped', async () => {
    const { completeOnboarding, userProfileRepository } = buildCompleteOnboarding();

    await completeOnboarding.execute(buildInput());
    const storedProfile = await userProfileRepository.findByUserId('user-1');

    expect(storedProfile).toMatchObject({
      waistCm: null,
      neckCm: null,
      hipCm: null,
      shoulderCm: null,
    });
  });

  test('stores targetWeightKg as null when it is omitted during onboarding', async () => {
    const { completeOnboarding, userProfileRepository } = buildCompleteOnboarding();

    const plan = await completeOnboarding.execute(buildInput({ targetWeightKg: undefined }));
    const storedProfile = await userProfileRepository.findByUserId('user-1');

    expect(plan.projection).toEqual({
      startWeightKg: 80,
      targetWeightKg: 80,
      estimatedTargetDate: null,
    });
    expect(storedProfile).toMatchObject({
      targetWeightKg: null,
      initialWeightKg: 80,
    });
  });
});
