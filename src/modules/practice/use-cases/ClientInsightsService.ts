import { evaluateAlerts, type Alert, type RuleSetting } from '../domain/alertRules';
import {
  addDays,
  computeAdherenceScore,
  computeWeightProgress,
  daysBetween,
  isoDay,
  parseDay,
  summarizeActivity,
  summarizeNutrition,
  topFoods,
  type ActivitySummary,
  type AdherenceScore,
  type DayRecord,
  type FoodTotal,
  type NutritionSummary,
  type SharedData,
  type Targets,
  type WeightPoint,
  type WeightProgress,
} from '../domain/analytics';
import type { ClientLink } from '../domain/practiceTypes';
import type { ClientDataPort, ClientTargets } from '../ports/ClientDataPort';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { ClientInsight, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

/** Window every alert rule looks back over. */
const ALERT_WINDOW_DAYS = 28;
/** The roster's score is always over this window, whatever period the detail page shows. */
export const ROSTER_SCORE_DAYS = 14;
const MAX_PERIOD_DAYS = 180;

export type AnalyticsPeriod = 14 | 30 | 'all';

export interface MeasurementRow {
  metric: string;
  unit: string;
  start: number;
  fourWeeksAgo: number | null;
  latest: number;
  latestDate: string;
  change: number;
}

export interface ClientAnalytics {
  period: { from: string; to: string; days: number };
  shared: SharedData;
  targets: ClientTargets | null;
  score: AdherenceScore;
  nutrition: NutritionSummary | null;
  activity: ActivitySummary | null;
  /** Every day of the period, oldest first; unshared fields are zero/null. */
  days: DayRecord[];
  topFoods: FoodTotal[];
  weight: (WeightProgress & { points: WeightPoint[] }) | null;
  measurements: MeasurementRow[];
  alerts: Alert[];
  computedAt: string;
}

export function sharedFrom(link: ClientLink): SharedData {
  return {
    meals: link.consentScopes.includes('meals'),
    water: link.consentScopes.includes('water'),
    steps: link.consentScopes.includes('steps'),
    body: link.consentScopes.includes('body_measurements'),
  };
}

function toTargets(t: ClientTargets | null): Targets | null {
  return t ? { kcal: t.dailyCalories, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, waterMl: t.waterMl, steps: t.steps } : null;
}

/**
 * Builds a client's analytics and alerts from the owning modules' data, only
 * ever reading scopes the client currently shares. Also keeps the roster's
 * cached insight (score + alerts) fresh. Authorization is the caller's job.
 */
export class ClientInsightsService {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly clientData: ClientDataPort,
    private readonly threads: LinkThreadPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async compute(link: ClientLink, today: Date, period: AnalyticsPeriod): Promise<ClientAnalytics> {
    const todayDay = isoDay(today);
    const startDay = isoDay(link.startedAt);
    const sinceStart = daysBetween(startDay, todayDay) + 1;
    const periodDays = period === 'all' ? Math.min(Math.max(sinceStart, 7), MAX_PERIOD_DAYS) : period;
    const periodFrom = addDays(todayDay, -(periodDays - 1));
    const fetchFrom = addDays(todayDay, -(Math.max(periodDays, ALERT_WINDOW_DAYS) - 1));
    const shared = sharedFrom(link);

    const [records, clientTargets, goal, measurements, settings, unanswered] = await Promise.all([
      this.clientData.getDayRecords(link.clientId, parseDay(fetchFrom), today, shared),
      this.clientData.getTargets(link.clientId),
      this.clientData.getGoal(link.clientId),
      shared.body ? this.clientData.listBodyMeasurements(link.clientId, { limit: 200 }) : Promise.resolve([]),
      this.repository.listAlertRuleSettings(link.dietitianId),
      this.threads.unansweredSince(link.id, link.clientId),
    ]);
    const targets = toTargets(clientTargets);

    const periodDaysRecords = records.days.filter((d) => d.date >= periodFrom);
    // Score only complete days (not today) the client was actually linked for.
    const scoredDays = periodDaysRecords.filter((d) => d.date < todayDay && d.date >= startDay);
    const weights: WeightPoint[] = measurements
      .filter((m) => m.metric === 'weight')
      .map((m) => ({ date: isoDay(m.date), kg: m.value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const alerts = evaluateAlerts(
      {
        today: todayDay,
        days: records.days.filter((d) => d.date >= addDays(todayDay, -(ALERT_WINDOW_DAYS - 1))),
        linkStartedOn: startDay,
        shared,
        targets,
        goal: goal?.goal ?? null,
        weights,
        unansweredSince: unanswered?.toISOString() ?? null,
        now: this.now(),
      },
      new Map<string, RuleSetting>(settings.map((s) => [s.ruleId, { enabled: s.enabled, threshold: s.threshold }])),
    );

    return {
      period: { from: periodFrom, to: todayDay, days: periodDays },
      shared,
      targets: clientTargets,
      score: computeAdherenceScore(scoredDays, targets, shared),
      nutrition: shared.meals ? summarizeNutrition(scoredDays, targets) : null,
      activity: shared.water || shared.steps ? summarizeActivity(scoredDays, targets) : null,
      days: periodDaysRecords,
      topFoods: topFoods(records.foods.filter((f) => f.date >= periodFrom)),
      weight: shared.body ? { ...computeWeightProgress(weights, goal?.targetWeightKg ?? null, todayDay), points: weights } : null,
      measurements: shared.body ? measurementTable(measurements, startDay) : [],
      alerts,
      computedAt: this.now().toISOString(),
    };
  }

  /** Recomputes and stores the roster insight (14-day score + alerts). */
  async refresh(link: ClientLink, today: Date): Promise<ClientInsight> {
    const analytics = await this.compute(link, today, ROSTER_SCORE_DAYS);
    const insight: ClientInsight = {
      linkId: link.id,
      score: analytics.score.score,
      scoreParts: analytics.score.parts,
      alerts: analytics.alerts,
      computedAt: this.now(),
    };
    await this.repository.saveInsight(insight);
    return insight;
  }
}

function measurementTable(
  rows: Array<{ metric: string; value: number; unit: string; date: Date }>,
  linkStartDay: string,
): MeasurementRow[] {
  const byMetric = new Map<string, Array<{ day: string; value: number; unit: string }>>();
  for (const row of rows) {
    const list = byMetric.get(row.metric) ?? [];
    list.push({ day: isoDay(row.date), value: row.value, unit: row.unit });
    byMetric.set(row.metric, list);
  }
  const table: MeasurementRow[] = [];
  for (const [metric, list] of byMetric) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    const latest = list[list.length - 1]!;
    // Baseline: the last reading at or before the relationship started, else the first after.
    const start = [...list].reverse().find((m) => m.day <= linkStartDay) ?? list[0]!;
    const fourWeeks = [...list].reverse().find((m) => m.day <= addDays(latest.day, -28));
    table.push({
      metric,
      unit: latest.unit,
      start: start.value,
      fourWeeksAgo: fourWeeks?.value ?? null,
      latest: latest.value,
      latestDate: latest.day,
      change: Math.round((latest.value - start.value) * 100) / 100,
    });
  }
  const order = ['weight', 'waist', 'hip', 'bodyFat', 'muscleMass', 'neck', 'shoulder'];
  return table.sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));
}
