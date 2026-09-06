import {
  dieticianTurnDurationSeconds,
  dieticianTurnTtfbSeconds,
} from '../../../shared/observability/metrics';
import { recordDieticianTurn } from './dieticianTurnMetrics';

async function sampleCount(
  metric: typeof dieticianTurnDurationSeconds | typeof dieticianTurnTtfbSeconds,
  labels: Record<string, string>,
): Promise<number> {
  const { values } = await metric.get();
  const bucket = values.find((v) => {
    if (!v.metricName?.endsWith('_count')) {
      return false;
    }
    const seen = v.labels as Record<string, string | number | undefined>;
    return Object.entries(labels).every(([k, val]) => seen[k] === val);
  });
  return typeof bucket?.value === 'number' ? bucket.value : 0;
}

describe('recordDieticianTurn', () => {
  it('observes every provided stage plus ttfb, tagged by lane and outcome', async () => {
    const before = await sampleCount(dieticianTurnDurationSeconds, {
      stage: 'total',
      lane: 'assisted',
      outcome: 'ok',
    });
    const ttfbBefore = await sampleCount(dieticianTurnTtfbSeconds, { lane: 'assisted', outcome: 'ok' });

    recordDieticianTurn({
      lane: 'assisted',
      outcome: 'ok',
      timings: { prepMs: 400, gatherMs: 1200, streamMs: 3000, ttfbMs: 1800, totalMs: 4700 },
    });

    expect(
      await sampleCount(dieticianTurnDurationSeconds, { stage: 'total', lane: 'assisted', outcome: 'ok' }),
    ).toBe(before + 1);
    expect(await sampleCount(dieticianTurnTtfbSeconds, { lane: 'assisted', outcome: 'ok' })).toBe(
      ttfbBefore + 1,
    );
  });

  it('skips stages that were never measured (e.g. a turn that failed during prep)', async () => {
    const gatherBefore = await sampleCount(dieticianTurnDurationSeconds, {
      stage: 'gather',
      lane: 'smalltalk',
      outcome: 'error',
    });

    recordDieticianTurn({ lane: 'smalltalk', outcome: 'error', timings: { totalMs: 250 } });

    expect(
      await sampleCount(dieticianTurnDurationSeconds, { stage: 'gather', lane: 'smalltalk', outcome: 'error' }),
    ).toBe(gatherBefore);
  });
});
