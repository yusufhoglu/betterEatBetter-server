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
import { toIsoDate } from '../../domain/dates';
import type {
  ClientActivity,
  ClientBodyMeasurement,
  ClientDataPort,
  ClientDay,
  ClientPlan,
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
export class ClientDataAdapter implements ClientDataPort {
  constructor(
    private readonly db: PrismaClient,
    private readonly getDaySummary: GetDaySummary,
    private readonly listBodyMeasurementsUseCase: ListBodyMeasurements,
    private readonly getWaterForDayUseCase: GetWaterForDay,
    private readonly getActivePlan: GetActivePlan,
    private readonly setDietitianPlanTargets: SetDietitianPlanTargets,
    private readonly releaseDietitianPlan: ReleaseDietitianPlan,
  ) {}

  async getDay(clientId: string, date: Date, includePhotos: boolean): Promise<ClientDay> {
    const summary = await this.getDaySummary.execute({ userId: clientId, date });
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
    const { items } = await this.listBodyMeasurementsUseCase.execute(clientId, input);
    return items.map((item) => ({ id: item.id, metric: item.metric, value: item.value, unit: item.unit, date: item.date }));
  }

  async getWaterForDay(clientId: string, date: Date): Promise<{ date: string; amountMl: number }> {
    const water = await this.getWaterForDayUseCase.execute({ userId: clientId, date });
    return { date: toIsoDate(date), amountMl: water.amountMl };
  }

  async getPlan(clientId: string): Promise<ClientPlan | null> {
    const plan = await this.getActivePlan.execute(clientId);
    return plan ? toClientPlan(plan) : null;
  }

  async setPlanTargets(
    clientId: string,
    dietitianId: string,
    targets: { dailyCalories: number; proteinG: number; carbsG: number; fatG: number },
  ): Promise<ClientPlan> {
    return toClientPlan(await this.setDietitianPlanTargets.execute({ clientId, dietitianId, ...targets }));
  }

  async releasePlan(clientId: string): Promise<void> {
    await this.releaseDietitianPlan.execute(clientId);
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
