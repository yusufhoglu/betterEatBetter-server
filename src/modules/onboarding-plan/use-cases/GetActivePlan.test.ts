import { InMemoryPlanRepository } from '../test-utils/fakes/InMemoryPlanRepository';
import { GetActivePlan } from './GetActivePlan';

describe('GetActivePlan', () => {
  test('returns the plan when one exists for the user', async () => {
    const planRepository = new InMemoryPlanRepository();
    await planRepository.create({ userId: 'user-1', dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 60 });

    const getActivePlan = new GetActivePlan(planRepository);
    const plan = await getActivePlan.execute('user-1');

    expect(plan).toMatchObject({ userId: 'user-1', dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 60 });
  });

  test('returns null (not an error) when the user has no plan yet', async () => {
    const planRepository = new InMemoryPlanRepository();
    const getActivePlan = new GetActivePlan(planRepository);

    await expect(getActivePlan.execute('unknown-user')).resolves.toBeNull();
  });
});
