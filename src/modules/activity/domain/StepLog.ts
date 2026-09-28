export const STEP_SOURCES = ['apple_health', 'health_connect', 'manual'] as const;
export type StepSource = (typeof STEP_SOURCES)[number];

/** A device's step total for one calendar day (UTC-midnight date, like meal/water logs). */
export interface StepLog {
  userId: string;
  date: Date;
  steps: number;
  source: StepSource;
  updatedAt: Date;
}

/** Anything above this in a day is a sensor/aggregation glitch, not walking. */
export const MAX_DAILY_STEPS = 100_000;
/** How far back one sync may reach (a fresh install back-fills a month). */
export const MAX_SYNC_DAYS = 31;
