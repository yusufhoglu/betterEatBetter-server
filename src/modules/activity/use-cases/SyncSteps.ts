import { ValidationError } from '../../../shared/errors/ValidationError';
import { MAX_DAILY_STEPS, MAX_SYNC_DAYS, type StepSource } from '../domain/StepLog';
import type { StepLogRepositoryPort } from '../ports/StepLogRepositoryPort';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SyncStepsInput {
  userId: string;
  /** The caller's "today" (UTC midnight of their local date) — no future days accepted. */
  today: Date;
  source: StepSource;
  days: Array<{ date: Date; steps: number }>;
}

/**
 * The phone pushes daily totals it read from Apple Health / Health Connect.
 * Idempotent: re-sending a day overwrites it with the newer total.
 */
export class SyncSteps {
  constructor(private readonly repository: StepLogRepositoryPort) {}

  async execute(input: SyncStepsInput): Promise<{ saved: number }> {
    const oldest = new Date(input.today.getTime() - (MAX_SYNC_DAYS - 1) * DAY_MS);
    const byDate = new Map<number, { date: Date; steps: number; source: StepSource }>();

    for (const day of input.days) {
      if (day.date > input.today || day.date < oldest) {
        throw new ValidationError('STEP_DATE_OUT_OF_RANGE', `Steps can be synced for the last ${MAX_SYNC_DAYS} days only`);
      }
      if (!Number.isInteger(day.steps) || day.steps < 0 || day.steps > MAX_DAILY_STEPS) {
        throw new ValidationError('INVALID_STEP_COUNT', `steps must be an integer between 0 and ${MAX_DAILY_STEPS}`);
      }
      byDate.set(day.date.getTime(), { date: day.date, steps: day.steps, source: input.source });
    }

    if (byDate.size > 0) {
      await this.repository.upsertMany(input.userId, [...byDate.values()]);
    }
    return { saved: byDate.size };
  }
}
