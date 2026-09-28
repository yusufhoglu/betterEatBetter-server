import { getUserId } from '../observability/tracer';

/** One LLM call's token usage, attributed to the requesting user when known. */
export interface LlmUsageEvent {
  readonly provider: string;
  readonly feature: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** From the request's trace context; null for background work with no user. */
  readonly userId: string | null;
  readonly at: Date;
}

export type LlmUsageSink = (event: LlmUsageEvent) => void;

let sink: LlmUsageSink | null = null;

/** Wired once at startup (main.ts). Providers stay unaware of where usage ends up. */
export function setLlmUsageSink(next: LlmUsageSink | null): void {
  sink = next;
}

/** Never throws — usage accounting must not fail an LLM call. */
export function emitLlmUsage(event: Omit<LlmUsageEvent, 'userId' | 'at'>): void {
  if (!sink) {
    return;
  }
  try {
    sink({ ...event, userId: getUserId() ?? null, at: new Date() });
  } catch {
    // accounting is best-effort
  }
}
