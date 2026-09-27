import type { PrismaClient } from '@prisma/client';
import type { ListBodyMeasurements } from '../../../body-analytics/use-cases/ListBodyMeasurements';
import type { GetDaySummary } from '../../../nutrition-logging/use-cases/GetDaySummary';
import type { GetActivePlan } from '../../../onboarding-plan/use-cases/GetActivePlan';
import type {
  ReleaseDietitianPlan,
  SetDietitianPlanTargets,
} from '../../../onboarding-plan/use-cases/SetDietitianPlanTargets';
import type { Plan } from '../../../onboarding-plan/ports/PlanRepositoryPort';
import type { GetWaterForDay } from '../../../water-logging/use-cases/GetWaterForDay';
import type { GetWaterForRange } from '../../../water-logging/use-cases/GetWaterForRange';
import type { GetStepsForRange } from '../../../activity/use-cases/GetStepsForRange';
import type { GetMealItemsForRange } from '../../../nutrition-logging/use-cases/GetMealItemsForRange';
import type { GetDailyTargets } from '../../../onboarding-plan/use-cases/GetDailyTargets';
import type { GetUserProfile } from '../../../onboarding-plan/use-cases/GetUserProfile';
import { addDays, isoDay, type DayRecord } from '../../domain/analytics';
import { toIsoDate } from '../../domain/dates';
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

const DAY_MS = 24 * 60 * 60 * 1000;

function toClientPlan(plan: Plan): ClientPlan {
  return {
    dailyCalories: plan.dailyCalories,
    proteinG: plan.proteinG,
    carbsG: plan.carbsG,
    fatG: plan.fatG,
    source: plan.source ?? 'self',
    setByDietitianId: plan.setByDietitianId ?? null,
    waterTargetMl: plan.waterTargetMl ?? null,
    stepTarget: plan.stepTarget ?? null,
    updatedAt: plan.updatedAt,
  };
}

/**
 * Bridges to the owning modules' public use-cases for per-client reads and
 * plan writes. The one exception is getActivity: the roster needs a cheap
 * aggregate over MANY clients at once, which no module exposes, so it runs
 * two read-only aggregate queries (meal_items, body_measurements) directly.
 * If that grows, it becomes the ClientDailySummary projection from the design doc.
 */
export interface ClientDataAdapterDeps {
  getDaySummary: GetDaySummary;
  listBodyMeasurements: ListBodyMeasurements;
  getWaterForDay: GetWaterForDay;
  getActivePlan: GetActivePlan;
  setDietitianPlanTargets: SetDietitianPlanTargets;
  releaseDietitianPlan: ReleaseDietitianPlan;
  getMealItemsForRange: GetMealItemsForRange;
  getWaterForRange: GetWaterForRange;
  getStepsForRange: GetStepsForRange;
  getDailyTargets: GetDailyTargets;
  getUserProfile: GetUserProfile;
}

export class ClientDataAdapter implements ClientDataPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly deps: ClientDataAdapterDeps,
  ) {}

  async getDayRecords(
    clientId: string,
    from: Date,
    to: Date,
    selection: DataSelection,
  ): Promise<{ days: DayRecord[]; foods: Array<{ date: string; name: string; calories: number }> }> {
    // Unshared sources are never even read.
    const [meals, water, steps] = await Promise.all([
      selection.meals ? this.deps.getMealItemsForRange.execute(clientId, from, to) : Promise.resolve([]),
      selection.water ? this.deps.getWaterForRange.execute(clientId, from, to) : Promise.resolve([]),
      selection.steps ? this.deps.getStepsForRange.execute(clientId, from, to) : Promise.resolve([]),
    ]);

    const days = new Map<string, DayRecord>();
    for (let day = isoDay(from); day <= isoDay(to); day = addDays(day, 1)) {
      days.set(day, { date: day, logged: false, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, mealTypes: [], waterMl: null, steps: null });
    }
    const foods: Array<{ date: string; name: string; calories: number }> = [];
    for (const meal of meals) {
      const record = days.get(isoDay(meal.date));
      if (!record || meal.entries.length === 0) continue;
      record.logged = true;
      record.mealTypes.push(meal.mealType);
      for (const entry of meal.entries) {
        record.kcal += entry.calories;
        record.proteinG += entry.proteinG;
        record.carbsG += entry.carbsG;
        record.fatG += entry.fatG;
        foods.push({ date: record.date, name: entry.name, calories: entry.calories });
      }
    }
    for (const w of water) {
      const record = days.get(w.date);
      if (record) record.waterMl = w.amountMl;
    }
    for (const s of steps) {
      const record = days.get(s.date);
      if (record) record.steps = s.steps;
    }
    return { days: [...days.values()], foods };
  }

  async getTargets(clientId: string): Promise<ClientTargets | null> {
    return this.deps.getDailyTargets.execute(clientId);
  }

  async getGoal(clientId: string): Promise<ClientGoal | null> {
    const profile = await this.deps.getUserProfile.execute(clientId);
    return profile ? { goal: profile.goal, targetWeightKg: profile.targetWeightKg, heightCm: profile.heightCm } : null;
  }

  getSteps(clientId: string, from: Date, to: Date): Promise<Array<{ date: string; steps: number }>> {
    return this.deps.getStepsForRange.execute(clientId, from, to);
  }

  async getDay(clientId: string, date: Date, includePhotos: boolean): Promise<ClientDay> {
    const summary = await this.deps.getDaySummary.execute({ userId: clientId, date });
    return {
      date: toIsoDate(date),
      meals: summary.mealItems.map((meal) => {
        const totals = meal.entries.reduce(
          (sum, entry) => ({
            calories: sum.calories + entry.calories,
            proteinG: sum.proteinG + entry.proteinG,
            carbsG: sum.carbsG + entry.carbsG,
            fatG: sum.fatG + entry.fatG,
          }),
          { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        );
        return {
          mealType: meal.mealType,
          entries: meal.entries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            portionGrams: entry.portionGrams,
            calories: entry.calories,
            proteinG: entry.proteinG,
            carbsG: entry.carbsG,
            fatG: entry.fatG,
            photoUrl: includePhotos ? (entry.photoUrl ?? null) : null,
          })),
          ...totals,
          photoUrls: includePhotos ? meal.photoUrls : [],
        };
      }),
      consumed: {
        calories: summary.consumed.calories,
        proteinG: summary.consumed.proteinG,
        carbsG: summary.consumed.carbsG,
        fatG: summary.consumed.fatG,
      },
      goals: {
        calories: summary.dailyCalorieGoal,
        proteinG: summary.dailyProteinGoal,
        carbsG: summary.dailyCarbsGoal,
        fatG: summary.dailyFatGoal,
      },
    };
  }

  async listBodyMeasurements(
    clientId: string,
    input: { metric?: string; limit?: number; cursor?: string },
  ): Promise<ClientBodyMeasurement[]> {
    const { items } = await this.deps.listBodyMeasurements.execute(clientId, input);
    return items.map((item) => ({ id: item.id, metric: item.metric, value: item.value, unit: item.unit, date: item.date }));
  }

  async getWaterForDay(clientId: string, date: Date): Promise<{ date: string; amountMl: number }> {
    const water = await this.deps.getWaterForDay.execute({ userId: clientId, date });
    return { date: toIsoDate(date), amountMl: water.amountMl };
  }

  async getPlan(clientId: string): Promise<ClientPlan | null> {
    const plan = await this.deps.getActivePlan.execute(clientId);
    return plan ? toClientPlan(plan) : null;
  }

  async setPlanTargets(
    clientId: string,
    dietitianId: string,
    targets: {
      dailyCalories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      waterTargetMl?: number | null;
      stepTarget?: number | null;
    },
  ): Promise<ClientPlan> {
    return toClientPlan(await this.deps.setDietitianPlanTargets.execute({ clientId, dietitianId, ...targets }));
  }

  async releasePlan(clientId: string): Promise<void> {
    await this.deps.releaseDietitianPlan.execute(clientId);
  }

  async getActivity(clientIds: string[], today: Date): Promise<Map<string, ClientActivity>> {
    const result = new Map<string, ClientActivity>(
      clientIds.map((clientId) => [clientId, { clientId, lastLoggedDate: null, daysLoggedLast7: 0, latestWeightKg: null }]),
    );
    if (clientIds.length === 0) {
      return result;
    }

    const weekStart = new Date(new Date(`${toIsoDate(today)}T00:00:00.000Z`).getTime() - 6 * DAY_MS);
    const [meals, weights] = await Promise.all([
      this.db.$queryRaw<Array<{ userId: string; lastDate: Date; recentDays: bigint }>>`
        SELECT "userId",
               MAX("date") AS "lastDate",
               COUNT(DISTINCT "date") FILTER (WHERE "date" >= ${weekStart}::date) AS "recentDays"
        FROM "meal_items"
        WHERE "userId" = ANY(${clientIds}) AND jsonb_array_length("entries") > 0
        GROUP BY "userId"`,
      this.db.$queryRaw<Array<{ userId: string; value: number }>>`
        SELECT DISTINCT ON ("userId") "userId", "value"
        FROM "body_measurements"
        WHERE "userId" = ANY(${clientIds}) AND "metric" = 'weight'
        ORDER BY "userId", "date" DESC`,
    ]);

    for (const row of meals) {
      const activity = result.get(row.userId)!;
      activity.lastLoggedDate = toIsoDate(row.lastDate);
      activity.daysLoggedLast7 = Number(row.recentDays);
    }
    for (const row of weights) {
      result.get(row.userId)!.latestWeightKg = row.value;
    }
    return result;
  }
}
