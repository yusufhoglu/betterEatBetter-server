import type { StepLog, StepSource } from '../domain/StepLog';

export interface StepLogRepositoryPort {
  /** Upsert per (user, date): the device re-sends a day's growing total. */
  upsertMany(userId: string, days: Array<{ date: Date; steps: number; source: StepSource }>): Promise<void>;
  /** Inclusive range, oldest first. */
  findInRange(userId: string, from: Date, to: Date): Promise<StepLog[]>;
}
