import { addDays, isoDay, type DayRecord } from '../../domain/analytics';
import type {
  ClientActivity,
  ClientBodyMeasurement,
  ClientDataPort,
  ClientDay,
  ClientGoal,
  ClientPlan,
  ClientTargets,
  DataSelection,
} from '../../ports/ClientDataPort';

export class FakeClientData implements ClientDataPort {
  readonly plans = new Map<string, ClientPlan>();
  readonly activity = new Map<string, ClientActivity>();
  readonly released: string[] = [];
  /** Per-day overrides keyed by YYYY-MM-DD; unspecified days are perfect days. */
  readonly dayOverrides = new Map<string, Partial<DayRecord>>();
  readonly selections: DataSelection[] = [];
  targets: ClientTargets | null = {
    dailyCalories: 1800,
    proteinG: 120,
    carbsG: 180,
    fatG: 66,
    waterMl: 2100,
    steps: 8000,
    waterAuto: true,
    stepsAuto: true,
    source: 'self',
  };
  weights: ClientBodyMeasurement[] = [{ id: 'm1', metric: 'weight', value: 80, unit: 'kg', date: new Date('2026-09-20') }];

  async getDayRecords(_clientId: string, from: Date, to: Date, selection: DataSelection) {
    this.selections.push(selection);
    const days: DayRecord[] = [];
    for (let d = isoDay(from); d <= isoDay(to); d = addDays(d, 1)) {
      days.push({
        date: d,
        logged: selection.meals,
        kcal: selection.meals ? 1800 : 0,
        proteinG: selection.meals ? 120 : 0,
        carbsG: selection.meals ? 180 : 0,
        fatG: selection.meals ? 66 : 0,
        mealTypes: selection.meals ? ['lunch'] : [],
        waterMl: selection.water ? 2100 : null,
        steps: selection.steps ? 9000 : null,
        ...this.dayOverrides.get(d),
      });
    }
    return { days, foods: selection.meals ? [{ date: isoDay(to), name: 'Mercimek çorbası', calories: 180 }] : [] };
  }

  async getTargets(): Promise<ClientTargets | null> {
    return this.targets;
  }

  async getGoal(): Promise<ClientGoal | null> {
    return { goal: 'lose', targetWeightKg: 70, heightCm: 170 };
  }

  async getSteps(_clientId: string, from: Date): Promise<Array<{ date: string; steps: number }>> {
    return [{ date: isoDay(from), steps: 9000 }];
  }

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

  async listBodyMeasurements(_clientId: string, input: { metric?: string }): Promise<ClientBodyMeasurement[]> {
    return this.weights.filter((w) => !input.metric || w.metric === input.metric);
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
    targets: { dailyCalories: number; proteinG: number; carbsG: number; fatG: number; waterTargetMl?: number | null; stepTarget?: number | null },
  ): Promise<ClientPlan> {
    const plan: ClientPlan = {
      ...targets,
      waterTargetMl: targets.waterTargetMl ?? null,
      stepTarget: targets.stepTarget ?? null,
      source: 'dietitian',
      setByDietitianId: dietitianId,
      updatedAt: new Date(),
    };
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
