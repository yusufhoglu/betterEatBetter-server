import {
  dieticianTurnDurationSeconds,
  dieticianTurnTtfbSeconds,
} from '../../../shared/observability/metrics';

export type DieticianLane = 'smalltalk' | 'assisted';

/** Millisecond stage timings for one dietician turn; any stage may be absent. */
export interface DieticianTurnTimings {
  /** findOrCreate + persist user message + classify + plan/snapshot lookup. */
  prepMs?: number;
  /** The cheap-tier tool-calling loop (assisted lane only). */
  gatherMs?: number;
  /** Wall-clock spent streaming the answer (smalltalk or advice). */
  streamMs?: number;
  /** Turn start to the first chunk the user sees. */
  ttfbMs?: number;
  /** Turn start to generator completion (includes the post-turn digest wait). */
  totalMs?: number;
}

/**
 * Feeds the Prometheus histograms. `outcome` is `ok` on success or the
 * DomainError code / `error` on failure, so a slow-failing turn is separable
 * from a slow-succeeding one.
 */
export function recordDieticianTurn(params: {
  lane: DieticianLane;
  outcome: string;
  timings: DieticianTurnTimings;
}): void {
  const { lane, outcome, timings } = params;

  const observeStage = (stage: string, ms: number | undefined): void => {
    if (ms !== undefined) {
      dieticianTurnDurationSeconds.observe({ stage, lane, outcome }, ms / 1000);
    }
  };

  observeStage('prep', timings.prepMs);
  observeStage('gather', timings.gatherMs);
  observeStage('stream', timings.streamMs);
  observeStage('total', timings.totalMs);

  if (timings.ttfbMs !== undefined) {
    dieticianTurnTtfbSeconds.observe({ lane, outcome }, timings.ttfbMs / 1000);
  }
}
