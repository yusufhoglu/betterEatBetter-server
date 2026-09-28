import { InMemoryPlanRepository } from '../test-utils/fakes/InMemoryPlanRepository';
import { InMemoryUserProfileRepository } from '../test-utils/fakes/InMemoryUserProfileRepository';
import { ReleaseDietitianPlan, SetDietitianPlanTargets } from './SetDietitianPlanTargets';
import { UpdatePlan } from './UpdatePlan';

const targets = { dailyCalories: 1800, proteinG: 120, carbsG: 180, fatG: 66 };

async function seed() {
  const planRepository = new InMemoryPlanRepository();
  const profileRepository = new InMemoryUserProfileRepository();
  await profileRepository.create({
    userId: 'client-1',
    weightKg: 80,
    targetWeightKg: 70,
    initialWeightKg: 80,
    heightCm: 175,
    age: 30,
    gender: 'male',
    workoutsPerWeek: 3,
    goal: 'lose',
    weeklyPaceKg: 0.5,
  } as never);
  await planRepository.create({ userId: 'client-1', dailyCalories: 2200, proteinG: 150, carbsG: 220, fatG: 80 });
  return { planRepository, profileRepository };
}

describe('SetDietitianPlanTargets', () => {
  it('sets the targets and marks the plan as dietitian-owned', async () => {
    const { planRepository } = await seed();

    const plan = await new SetDietitianPlanTargets(planRepository).execute({
      clientId: 'client-1',
      dietitianId: 'dietitian-1',
      ...targets,
    });

    expect(plan).toMatchObject({ ...targets, source: 'dietitian', setByDietitianId: 'dietitian-1' });
  });

  it('rejects a client that has not onboarded', async () => {
    const useCase = new SetDietitianPlanTargets(new InMemoryPlanRepository());

    await expect(useCase.execute({ clientId: 'nobody', dietitianId: 'd', ...targets })).rejects.toMatchObject({
      code: 'NOT_ONBOARDED',
    });
  });

  it('blocks client macro edits but keeps the targets on a goal change', async () => {
    const { planRepository, profileRepository } = await seed();
    await new SetDietitianPlanTargets(planRepository).execute({ clientId: 'client-1', dietitianId: 'd', ...targets });
    const updatePlan = new UpdatePlan(profileRepository, planRepository);

    await expect(updatePlan.execute('client-1', { dailyCalories: 2500 })).rejects.toMatchObject({
      code: 'PLAN_MANAGED_BY_DIETITIAN',
    });

    const afterGoalChange = await updatePlan.execute('client-1', { weightKg: 78 });
    expect(afterGoalChange).toMatchObject(targets);
  });

  it('release hands ownership back and keeps the targets', async () => {
    const { planRepository } = await seed();
    await new SetDietitianPlanTargets(planRepository).execute({ clientId: 'client-1', dietitianId: 'd', ...targets });

    await new ReleaseDietitianPlan(planRepository).execute('client-1');

    expect(await planRepository.findByUserId('client-1')).toMatchObject({
      ...targets,
      source: 'self',
      setByDietitianId: null,
    });
  });
});
