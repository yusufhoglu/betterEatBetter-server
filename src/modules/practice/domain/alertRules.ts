import { addDays, daysBetween, type DayRecord, type SharedData, type Targets, type WeightPoint } from './analytics';

/**
 * Rule-based alerts (decided 2026-09-28: rules, not an LLM). Every rule reads
 * only data the client shares; a rule whose data isn't shared never fires.
 * Thresholds have defaults and can be overridden per dietitian
 * (AlertRuleSetting). Messages are Turkish (the panel's language) and every
 * alert also carries `params` so a client may render its own copy.
 */

export type AlertSeverity = 'high' | 'medium' | 'low';
export type AlertScope = 'meals' | 'body' | 'water' | 'steps' | 'messages';

export interface AlertContext {
  today: string;
  /** Up to the last 28 days, oldest first, INCLUDING today. */
  days: DayRecord[];
  linkStartedOn: string;
  shared: SharedData;
  targets: Targets | null;
  goal: 'lose' | 'maintain' | 'gain' | null;
  weights: WeightPoint[];
  /** When the client's oldest still-unanswered chat message was sent (ISO). */
  unansweredSince: string | null;
  now: Date;
}

export interface Alert {
  ruleId: string;
  severity: AlertSeverity;
  message: string;
  params: Record<string, number | string>;
}

export interface AlertRule {
  id: string;
  scope: AlertScope;
  severity: AlertSeverity;
  defaultThreshold: number;
  unit: string;
  evaluate(ctx: AlertContext, threshold: number): Omit<Alert, 'ruleId' | 'severity'> | null;
}

const fmt = (v: number, digits = 0) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Complete days (before today) within the last `n` days, oldest first. */
function lastCompleteDays(ctx: AlertContext, n: number): DayRecord[] {
  const from = addDays(ctx.today, -n);
  return ctx.days.filter((d) => d.date >= from && d.date < ctx.today && d.date >= ctx.linkStartedOn);
}

function sortedWeights(ctx: AlertContext): WeightPoint[] {
  return [...ctx.weights].sort((a, b) => a.date.localeCompare(b.date));
}

/** Latest weight at or before `day`. */
function weightOn(weights: WeightPoint[], day: string): WeightPoint | null {
  let found: WeightPoint | null = null;
  for (const w of weights) {
    if (w.date <= day) found = w;
  }
  return found;
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'no_logs',
    scope: 'meals',
    severity: 'high',
    defaultThreshold: 2,
    unit: 'days',
    evaluate(ctx, threshold) {
      const lastLogged = [...ctx.days].reverse().find((d) => d.logged);
      if (!lastLogged) return null; // never_started covers this
      const emptyFullDays = daysBetween(lastLogged.date, ctx.today) - 1;
      return emptyFullDays >= threshold
        ? { message: `${emptyFullDays} gündür kayıt yok`, params: { days: emptyFullDays } }
        : null;
    },
  },
  {
    id: 'never_started',
    scope: 'meals',
    severity: 'high',
    defaultThreshold: 3,
    unit: 'days',
    evaluate(ctx, threshold) {
      const sinceStart = daysBetween(ctx.linkStartedOn, ctx.today);
      const anyLog = ctx.days.some((d) => d.logged && d.date >= ctx.linkStartedOn);
      return !anyLog && sinceStart >= threshold
        ? { message: `Bağlanalı ${sinceStart} gün oldu, hiç kayıt yok`, params: { days: sinceStart } }
        : null;
    },
  },
  {
    id: 'no_weighin',
    scope: 'body',
    severity: 'medium',
    defaultThreshold: 14,
    unit: 'days',
    evaluate(ctx, threshold) {
      const latest = sortedWeights(ctx).at(-1);
      const since = latest ? daysBetween(latest.date, ctx.today) : daysBetween(ctx.linkStartedOn, ctx.today);
      if (since < threshold) return null;
      return latest
        ? { message: `${since} gündür tartı girilmedi`, params: { days: since } }
        : { message: 'Hiç tartı girilmedi', params: { days: since } };
    },
  },
  {
    id: 'kcal_off',
    scope: 'meals',
    severity: 'medium',
    defaultThreshold: 15,
    unit: 'percent',
    evaluate(ctx, threshold) {
      if (!ctx.targets) return null;
      const off = lastCompleteDays(ctx, 7).filter(
        (d) => d.logged && (Math.abs(d.kcal - ctx.targets!.kcal) / ctx.targets!.kcal) * 100 > threshold,
      );
      return off.length >= 4
        ? { message: `Son 7 günün ${off.length}'ünde kalori hedefin ±%${fmt(threshold)} dışında`, params: { days: off.length, threshold } }
        : null;
    },
  },
  {
    id: 'weekend',
    scope: 'meals',
    severity: 'medium',
    defaultThreshold: 15,
    unit: 'percent',
    evaluate(ctx, threshold) {
      const logged = lastCompleteDays(ctx, 14).filter((d) => d.logged);
      const dow = (d: DayRecord) => new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const weekend = logged.filter((d) => dow(d) === 0 || dow(d) === 6);
      const weekday = logged.filter((d) => dow(d) !== 0 && dow(d) !== 6);
      if (weekend.length < 2 || weekday.length < 3) return null;
      const avg = (xs: DayRecord[]) => xs.reduce((s, d) => s + d.kcal, 0) / xs.length;
      const pct = ((avg(weekend) - avg(weekday)) / avg(weekday)) * 100;
      return pct > threshold
        ? { message: `Hafta sonu kalori ortalaması hafta içinden %${fmt(pct)} yüksek (${fmt(avg(weekend))} kcal)`, params: { percent: Math.round(pct), weekendKcal: Math.round(avg(weekend)) } }
        : null;
    },
  },
  {
    id: 'protein_low',
    scope: 'meals',
    severity: 'medium',
    defaultThreshold: 80,
    unit: 'percent',
    evaluate(ctx, threshold) {
      if (!ctx.targets) return null;
      const logged = lastCompleteDays(ctx, 14).filter((d) => d.logged);
      if (logged.length < 4) return null;
      const hits = logged.filter((d) => d.proteinG >= (ctx.targets!.proteinG * threshold) / 100).length;
      return hits * 2 < logged.length
        ? { message: `Protein ${logged.length} kayıtlı günün sadece ${hits}'inde hedefin %${fmt(threshold)}'ine ulaştı`, params: { hits, days: logged.length } }
        : null;
    },
  },
  {
    id: 'plateau',
    scope: 'body',
    severity: 'medium',
    defaultThreshold: 0.2,
    unit: 'kg',
    evaluate(ctx, threshold) {
      if (ctx.goal !== 'lose' && ctx.goal !== 'gain') return null;
      const weights = sortedWeights(ctx);
      const latest = weights.at(-1);
      if (!latest) return null;
      const past = weightOn(weights, addDays(latest.date, -14));
      if (!past || past === latest || daysBetween(ctx.linkStartedOn, past.date) < 0) return null;
      const change = Math.abs(latest.kg - past.kg);
      return change < threshold
        ? { message: `Kilo ${daysBetween(past.date, latest.date)} gündür değişmedi (${fmt(latest.kg, 1)} kg)`, params: { days: daysBetween(past.date, latest.date), kg: latest.kg } }
        : null;
    },
  },
  {
    id: 'too_fast',
    scope: 'body',
    severity: 'high',
    defaultThreshold: 1,
    unit: 'kg_per_week',
    evaluate(ctx, threshold) {
      const weights = sortedWeights(ctx);
      const latest = weights.at(-1);
      if (!latest) return null;
      const past = weightOn(weights, addDays(latest.date, -14));
      if (!past || past === latest) return null;
      const span = daysBetween(past.date, latest.date);
      if (span < 7) return null;
      const weeklyLoss = ((past.kg - latest.kg) / span) * 7;
      return weeklyLoss > threshold
        ? { message: `Haftada ${fmt(weeklyLoss, 1)} kg kayıp — hızlı`, params: { kgPerWeek: Math.round(weeklyLoss * 10) / 10 } }
        : null;
    },
  },
  {
    id: 'water_low',
    scope: 'water',
    severity: 'low',
    defaultThreshold: 60,
    unit: 'percent',
    evaluate(ctx, threshold) {
      if (!ctx.targets) return null;
      const days = lastCompleteDays(ctx, 7);
      const withData = days.filter((d) => d.waterMl !== null);
      if (withData.length < 3) return null;
      const avg = days.reduce((s, d) => s + (d.waterMl ?? 0), 0) / days.length;
      const pct = (avg / ctx.targets.waterMl) * 100;
      return pct < threshold
        ? { message: `Su ortalaması hedefin %${fmt(pct)}'i (${fmt(avg / 1000, 1)} L)`, params: { percent: Math.round(pct) } }
        : null;
    },
  },
  {
    id: 'steps_low',
    scope: 'steps',
    severity: 'low',
    defaultThreshold: 50,
    unit: 'percent',
    evaluate(ctx, threshold) {
      if (!ctx.targets) return null;
      const withData = lastCompleteDays(ctx, 7).filter((d) => d.steps !== null);
      if (withData.length < 3) return null;
      const avg = withData.reduce((s, d) => s + d.steps!, 0) / withData.length;
      const pct = (avg / ctx.targets.steps) * 100;
      return pct < threshold
        ? { message: `Adım ortalaması ${fmt(avg)} — hedefin %${fmt(pct)}'i`, params: { avgSteps: Math.round(avg), percent: Math.round(pct) } }
        : null;
    },
  },
  {
    id: 'unanswered',
    scope: 'messages',
    severity: 'medium',
    defaultThreshold: 24,
    unit: 'hours',
    evaluate(ctx, threshold) {
      if (!ctx.unansweredSince) return null;
      const hours = (ctx.now.getTime() - new Date(ctx.unansweredSince).getTime()) / 3_600_000;
      return hours >= threshold
        ? { message: `Mesajı ${fmt(Math.floor(hours))} saattir yanıtsız`, params: { hours: Math.floor(hours) } }
        : null;
    },
  },
];

export interface RuleSetting {
  enabled: boolean;
  threshold: number | null;
}

function isScopeShared(scope: AlertScope, shared: SharedData): boolean {
  switch (scope) {
    case 'meals':
      return shared.meals;
    case 'body':
      return shared.body;
    case 'water':
      return shared.water;
    case 'steps':
      return shared.steps;
    case 'messages':
      return true;
  }
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };

export function evaluateAlerts(ctx: AlertContext, settings: Map<string, RuleSetting>): Alert[] {
  const alerts: Alert[] = [];
  for (const rule of ALERT_RULES) {
    const setting = settings.get(rule.id);
    if (setting && !setting.enabled) continue;
    if (!isScopeShared(rule.scope, ctx.shared)) continue;
    const result = rule.evaluate(ctx, setting?.threshold ?? rule.defaultThreshold);
    if (result) alerts.push({ ruleId: rule.id, severity: rule.severity, ...result });
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
