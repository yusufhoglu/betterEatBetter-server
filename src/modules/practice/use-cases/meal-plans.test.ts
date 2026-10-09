import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { encodeInviteCode } from '../domain/inviteCode';
import { mealPlanInputSchema, type CustomFood, type FoodOption, type MealPlan, type MealPlanInput, type PlanHeader } from '../domain/mealPlan';
import type { FoodSearchPort } from '../ports/FoodSearchPort';
import type { MealPlanRepositoryPort } from '../ports/MealPlanRepositoryPort';
import { FakeLinkThreads } from '../test-utils/fakes/FakeLinkThreads';
import { InMemoryManagedClientCache } from '../test-utils/fakes/InMemoryManagedClientCache';
import { InMemoryPracticeRepository } from '../test-utils/fakes/InMemoryPracticeRepository';
import { ClientAccessPolicy } from './ClientAccessPolicy';
import { JoinDietitian } from './JoinDietitian';
import { MealPlans } from './MealPlans';

const SECRET = 'test-invite-secret-test-invite-secret';
const now = new Date('2026-09-27T10:00:00.000Z');

class InMemoryMealPlans implements MealPlanRepositoryPort {
  plans = new Map<string, MealPlan>();
  headers = new Map<string, PlanHeader>();
  foods = new Map<string, CustomFood>();

  async findPlanByLink(linkId: string) {
    return this.plans.get(linkId) ?? null;
  }
  async savePlan(linkId: string, dietitianId: string, input: MealPlanInput) {
    const plan: MealPlan = { id: `plan-${linkId}`, linkId, dietitianId, ...input, createdAt: now, updatedAt: now };
    this.plans.set(linkId, plan);
    return plan;
  }
  async deletePlan(linkId: string) {
    this.plans.delete(linkId);
  }
  async findHeader(dietitianId: string) {
    return this.headers.get(dietitianId) ?? null;
  }
  async saveHeader(dietitianId: string, header: PlanHeader) {
    this.headers.set(dietitianId, header);
    return header;
  }
  async searchCustomFoods(dietitianId: string, query: string, limit: number) {
    return [...this.foods.values()]
      .filter((f) => f.dietitianId === dietitianId && f.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);
  }
  async findCustomFood(id: string) {
    return this.foods.get(id) ?? null;
  }
  async createCustomFood(dietitianId: string, input: Omit<CustomFood, 'id' | 'dietitianId'>) {
    const food = { id: `food-${this.foods.size + 1}`, dietitianId, ...input };
    this.foods.set(food.id, food);
    return food;
  }
  async updateCustomFood(id: string, input: Omit<CustomFood, 'id' | 'dietitianId'>) {
    const food = { ...this.foods.get(id)!, ...input };
    this.foods.set(id, food);
    return food;
  }
  async deleteCustomFood(id: string) {
    this.foods.delete(id);
  }
}

const catalogHit: FoodOption = {
  source: 'catalog', id: 'c1', name: 'Oatmeal', brand: null, amount: 100, unit: 'g', calories: 380, proteinG: 13, carbsG: 67, fatG: 7,
};
const pushed: string[] = [];
const notifier = { notifyPlanUpdated: async (id: string) => void pushed.push(id) };
const catalog: FoodSearchPort = { search: async () => [catalogHit] };

const plan: MealPlanInput = {
  title: 'Hafta 1',
  notes: null,
  meals: [
    {
      id: 'm1', name: 'Sabah', time: '08:00', note: null,
      items: [{ id: 'i1', name: 'Yulaf', amount: 50, unit: 'g', calories: 190, proteinG: 6, carbsG: 33, fatG: 3, note: null }],
    },
  ],
};

const clock = { now };

async function setup() {
  pushed.length = 0;
  clock.now = now;
  const practice = new InMemoryPracticeRepository();
  practice.addOrganization({ id: 'clinic', name: 'Klinik', kind: 'clinic' });
  practice.addDietitian('dyt-a', 'clinic', 'dietitian', '0000000a');
  practice.addDietitian('dyt-b', 'clinic', 'dietitian', '0000000b');
  for (const id of ['dyt-a', 'dyt-b', 'client', 'stranger']) practice.addPerson(id, id);
  await new JoinDietitian(practice, new FakeLinkThreads(), new InMemoryManagedClientCache(), SECRET, () => now).execute({
    clientId: 'client',
    code: encodeInviteCode('0000000a', 7, SECRET, now).code,
    consentScopes: [],
  });
  const store = new InMemoryMealPlans();
  const mealPlans = new MealPlans(store, practice, new ClientAccessPolicy(practice), catalog, notifier, () => clock.now);
  return { mealPlans, store };
}

describe('MealPlans', () => {
  it('lets the assigned dietitian save a plan that the client then reads', async () => {
    const { mealPlans } = await setup();
    expect(await mealPlans.getMine('client')).toBeNull();

    await mealPlans.save('dyt-a', 'client', plan);

    expect((await mealPlans.getForClient('dyt-a', 'client'))?.meals[0]?.name).toBe('Sabah');
    expect((await mealPlans.getMine('client'))?.title).toBe('Hafta 1');
  });

  it('pushes to the client on a first save, then stays quiet for a few minutes', async () => {
    const { mealPlans } = await setup();
    await mealPlans.save('dyt-a', 'client', plan);
    expect(pushed).toEqual(['client']);

    await mealPlans.save('dyt-a', 'client', { ...plan, title: 'Hafta 1b' });
    expect(pushed).toHaveLength(1);

    clock.now = new Date(now.getTime() + 11 * 60 * 1000);
    await mealPlans.save('dyt-a', 'client', { ...plan, title: 'Hafta 2' });
    expect(pushed).toHaveLength(2);
  });

  it('hides the client from other dietitians and refuses their writes', async () => {
    const { mealPlans } = await setup();
    await expect(mealPlans.save('dyt-b', 'client', plan)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mealPlans.getForClient('dyt-b', 'client')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes the plan', async () => {
    const { mealPlans } = await setup();
    await mealPlans.save('dyt-a', 'client', plan);
    await mealPlans.remove('dyt-a', 'client');
    expect(await mealPlans.getMine('client')).toBeNull();
  });

  it('searches own foods first, then the catalog', async () => {
    const { mealPlans } = await setup();
    await mealPlans.createFood('dyt-a', { name: 'Oat bar', amount: 1, unit: 'adet', calories: 120, proteinG: 4, carbsG: 18, fatG: 4 });

    const hits = await mealPlans.searchFoods('dyt-a', 'oat');
    expect(hits.map((h) => h.source)).toEqual(['custom', 'catalog']);
    expect((await mealPlans.searchFoods('dyt-b', 'oat')).map((h) => h.source)).toEqual(['catalog']);
  });

  it('keeps custom foods private to their owner and plan tools to dietitians', async () => {
    const { mealPlans } = await setup();
    const food = await mealPlans.createFood('dyt-a', { name: 'X', amount: 1, unit: 'g', calories: 1, proteinG: 0, carbsG: 0, fatG: 0 });
    await expect(mealPlans.removeFood('dyt-b', food.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mealPlans.getHeader('client')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('defaults an unset header to empty and stores edits', async () => {
    const { mealPlans } = await setup();
    expect((await mealPlans.getHeader('dyt-a')).clinicName).toBeNull();
    await mealPlans.saveHeader('dyt-a', { clinicName: 'Klinik', tagline: null, contact: null, footer: null });
    expect((await mealPlans.getHeader('dyt-a')).clinicName).toBe('Klinik');
  });
});

describe('mealPlanInputSchema', () => {
  it('rejects a malformed time', () => {
    const bad = { ...plan, meals: [{ ...plan.meals[0]!, time: '25:00' }] };
    expect(mealPlanInputSchema.safeParse(bad).success).toBe(false);
  });
});
