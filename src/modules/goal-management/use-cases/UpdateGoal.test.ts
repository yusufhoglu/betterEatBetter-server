import { UpdateGoal } from './UpdateGoal';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { FakePlanUpdaterPort } from '../test-utils/fakes/FakePlanUpdaterPort';

describe('UpdateGoal', () => {
  test('delegates validated changes to PlanUpdaterPort and returns the recalculated plan', async () => {
    const planUpdater = new FakePlanUpdaterPort();
    const updateGoal = new UpdateGoal(planUpdater);

    const plan = await updateGoal.execute('user-1', { goal: 'gain', weeklyPaceKg: 0.25, targetWeightKg: 84 });

    expect(plan).toEqual(planUpdater.result);
    expect(planUpdater.calls).toEqual([
      { userId: 'user-1', changes: { goal: 'gain', weeklyPaceKg: 0.25, targetWeightKg: 84 } },
    ]);
  });

  test('throws ValidationError when every update field is omitted', async () => {
    const updateGoal = new UpdateGoal(new FakePlanUpdaterPort());

    await expect(updateGoal.execute('user-1', {})).rejects.toBeInstanceOf(ValidationError);
    await expect(updateGoal.execute('user-1', {})).rejects.toMatchObject({
      code: 'INVALID_GOAL_UPDATE',
    });
  });

  test('rethrows NOT_ONBOARDED from the delegated onboarding-plan update path', async () => {
    const planUpdater = new FakePlanUpdaterPort();
    const notOnboardedError = new NotFoundError('NOT_ONBOARDED', 'User has not completed onboarding');
    planUpdater.update = async () => {
      throw notOnboardedError;
    };

    const updateGoal = new UpdateGoal(planUpdater);

    await expect(updateGoal.execute('user-1', { weightKg: 79 })).rejects.toBe(notOnboardedError);
  });

  test('accepts manual macro override fields when they are present', async () => {
    const planUpdater = new FakePlanUpdaterPort();
    const updateGoal = new UpdateGoal(planUpdater);

    await updateGoal.execute('user-1', { dailyCalories: 2100, proteinG: 180, carbsG: 190, fatG: 62 });

    expect(planUpdater.calls).toEqual([
      {
        userId: 'user-1',
        changes: { dailyCalories: 2100, proteinG: 180, carbsG: 190, fatG: 62 },
      },
    ]);
  });
});
