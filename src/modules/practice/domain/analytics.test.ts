import { ALERT_RULES, evaluateAlerts, type AlertContext } from './alertRules';
import { addDays, computeAdherenceScore, computeWeightProgress, summarizeNutrition, topFoods, type DayRecord, type Targets } from './analytics';

const targets: Targets = { kcal: 1800, proteinG: 120, carbsG: 180, fatG: 66, waterMl: 2100, steps: 8000 };
const allShared = { meals: true, water: true, steps: true, body: true };
const today = '2026-09-28'; // Monday

function day(date: string, over: Partial<DayRecord> = {}): DayRecord {
  return { date, logged: true, kcal: 1800, proteinG: 120, carbsG: 180, fatG: 66, mealTypes: ['lunch'], waterMl: 2100, steps: 9000, ...over };
}

function series(n: number, f: (i: number, date: string) => Partial<DayRecord> = () => ({})): DayRecord[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1);
    return day(date, f(i, date));
  });
}

describe('computeAdherenceScore', () => {
  it('is 100 for a perfect fortnight', () => {
    expect(computeAdherenceScore(series(14), targets, allShared).score).toBe(100);
  });

  it('weights parts 30/30/20/10/10', () => {
    // logged every day, on calories, never on protein, no water, no steps
    const days = series(10, () => ({ proteinG: 50, waterMl: null, steps: null }));
    const { score, parts } = computeAdherenceScore(days, targets, allShared);
    expect(parts.map((p) => [p.id, p.hits])).toEqual([['logging', 10], ['calories', 10], ['protein', 0], ['water', 0], ['steps', 0]]);
    expect(score).toBe(60);
  });

  it('drops parts the client does not share and renormalises', () => {
    const days = series(10, () => ({ waterMl: null, steps: null }));
    const { score, parts } = computeAdherenceScore(days, targets, { meals: true, water: false, steps: false, body: false });
    expect(parts.map((p) => p.id)).toEqual(['logging', 'calories', 'protein']);
    expect(score).toBe(100);
  });

  it('is null with nothing to score', () => {
    expect(computeAdherenceScore([], targets, allShared).score).toBeNull();
  });
});

describe('summaries', () => {
  it('splits weekday and weekend calories', () => {
    const days = series(14, (_, date) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return { kcal: dow === 0 || dow === 6 ? 2400 : 1700 };
    });
    const s = summarizeNutrition(days, targets);
    expect(s.weekendAvgKcal).toBe(2400);
    expect(s.weekdayAvgKcal).toBe(1700);
    expect(s.daysInKcalRange).toBe(10);
  });

  it('ranks foods by calories, grouping names case-insensitively', () => {
    expect(
      topFoods([
        { name: 'Ekmek', calories: 100 },
        { name: 'ekmek ', calories: 150 },
        { name: 'Elma', calories: 90 },
      ]),
    ).toEqual([{ name: 'Ekmek', kcal: 250, count: 2 }, { name: 'Elma', kcal: 90, count: 1 }]);
  });

  it('projects the target date from the recent weekly rate', () => {
    const p = computeWeightProgress(
      [{ date: '2026-08-31', kg: 67 }, { date: '2026-09-14', kg: 66 }, { date: '2026-09-28', kg: 65 }],
      60,
      today,
    );
    expect(p.weeklyRateKg).toBe(-0.5);
    expect(p.remainingKg).toBe(5);
    expect(p.projectedTargetDate).toBe(addDays(today, 70));
  });
});

describe('alert rules', () => {
  function ctx(over: Partial<AlertContext> = {}): AlertContext {
    return {
      today,
      days: series(28),
      linkStartedOn: '2026-08-01',
      shared: allShared,
      targets,
      goal: 'lose',
      weights: [{ date: '2026-09-10', kg: 66 }, { date: '2026-09-26', kg: 65 }],
      unansweredSince: null,
      now: new Date(`${today}T12:00:00Z`),
      ...over,
    };
  }
  const ids = (c: AlertContext) => evaluateAlerts(c, new Map()).map((a) => a.ruleId);

  it('a model client triggers nothing', () => {
    expect(ids(ctx())).toEqual([]);
  });

  it('flags missing logs and never-started clients', () => {
    const gap = series(28, (i) => ({ logged: i < 24, kcal: i < 24 ? 1800 : 0 }));
    expect(evaluateAlerts(ctx({ days: gap }), new Map())[0]).toMatchObject({ ruleId: 'no_logs', message: '3 gündür kayıt yok' });

    const none = series(28, () => ({ logged: false, kcal: 0 }));
    expect(ids(ctx({ days: none, linkStartedOn: '2026-09-24' }))).toContain('never_started');
  });

  it('flags weekend overeating and low protein', () => {
    const days = series(28, (_, date) => {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      return { kcal: dow === 0 || dow === 6 ? 2300 : 1800, proteinG: 70 };
    });
    expect(ids(ctx({ days }))).toEqual(expect.arrayContaining(['weekend', 'protein_low']));
  });

  it('flags a plateau, fast loss, stale weigh-ins', () => {
    expect(ids(ctx({ weights: [{ date: '2026-09-10', kg: 65.1 }, { date: '2026-09-27', kg: 65 }] }))).toContain('plateau');
    expect(ids(ctx({ weights: [{ date: '2026-09-13', kg: 70 }, { date: '2026-09-27', kg: 66.5 }] }))).toContain('too_fast');
    expect(ids(ctx({ weights: [{ date: '2026-09-01', kg: 66 }] }))).toContain('no_weighin');
  });

  it('flags low water/steps and unanswered messages', () => {
    const days = series(28, () => ({ waterMl: 900, steps: 2500 }));
    expect(ids(ctx({ days, unansweredSince: '2026-09-27T06:00:00Z' }))).toEqual(
      expect.arrayContaining(['water_low', 'steps_low', 'unanswered']),
    );
  });

  it('respects unshared scopes and per-dietitian settings', () => {
    const days = series(28, () => ({ waterMl: 900, steps: 2500 }));
    expect(ids(ctx({ days, shared: { meals: true, body: true, water: false, steps: false } }))).toEqual([]);
    const settings = new Map([['steps_low', { enabled: false, threshold: null }], ['water_low', { enabled: true, threshold: 30 }]]);
    expect(evaluateAlerts(ctx({ days }), settings).map((a) => a.ruleId)).toEqual([]);
  });

  it('has unique rule ids', () => {
    expect(new Set(ALERT_RULES.map((r) => r.id)).size).toBe(ALERT_RULES.length);
  });
});
