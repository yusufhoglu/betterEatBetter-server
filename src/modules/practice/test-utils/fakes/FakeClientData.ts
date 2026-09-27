import type {
  ClientActivity,
  ClientBodyMeasurement,
  ClientDataPort,
  ClientDay,
  ClientPlan,
} from '../../ports/ClientDataPort';

export class FakeClientData implements ClientDataPort {
  readonly plans = new Map<string, ClientPlan>();
  readonly activity = new Map<string, ClientActivity>();
  readonly released: string[] = [];

  async getDay(_clientId: string, date: Date, includePhotos: boolean): Promise<ClientDay> {
    const photoUrls = includePhotos ? ['https://photos/1.jpg'] : [];
    return {
      date: date.toISOString().slice(0, 10),
      meals: [
        {
          mealType: 'lunch',
          entries: [
            {
              id: 'e1',
              name: 'Mercimek çorbası',
              portionGrams: 250,
              calories: 180,
              proteinG: 9,
              carbsG: 25,
              fatG: 5,
              photoUrl: photoUrls[0] ?? null,
            },
          ],
          calories: 180,
          proteinG: 9,
          carbsG: 25,
          fatG: 5,
          photoUrls,
        },
      ],
      consumed: { calories: 180, proteinG: 9, carbsG: 25, fatG: 5 },
      goals: { calories: 2000, proteinG: 120, carbsG: 200, fatG: 70 },
    };
  }

  async listBodyMeasurements(): Promise<ClientBodyMeasurement[]> {
    return [{ id: 'm1', metric: 'weight', value: 80, unit: 'kg', date: new Date('2026-09-20') }];
  }

  async getWaterForDay(_clientId: string, date: Date): Promise<{ date: string; amountMl: number }> {
    return { date: date.toISOString().slice(0, 10), amountMl: 1500 };
  }

  async getPlan(clientId: string): Promise<ClientPlan | null> {
    return this.plans.get(clientId) ?? null;
  }

  async setPlanTargets(
    clientId: string,
    dietitianId: string,
    targets: { dailyCalories: number; proteinG: number; carbsG: number; fatG: number },
  ): Promise<ClientPlan> {
    const plan: ClientPlan = { ...targets, source: 'dietitian', setByDietitianId: dietitianId, updatedAt: new Date() };
    this.plans.set(clientId, plan);
    return plan;
  }

  async releasePlan(clientId: string): Promise<void> {
    this.released.push(clientId);
  }

  async getActivity(clientIds: string[]): Promise<Map<string, ClientActivity>> {
    return new Map(clientIds.filter((id) => this.activity.has(id)).map((id) => [id, this.activity.get(id)!]));
  }
}
