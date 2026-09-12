import type { WaterLog } from '../domain/WaterLog';

export interface WaterLogRepositoryPort {
  findByUserIdAndDate(userId: string, date: Date): Promise<WaterLog | null>;

  /** Adds [amountMl] (may be negative) to the day's running total, clamped at 0. Creates the row if missing. */
  addAmount(userId: string, date: Date, amountMl: number): Promise<WaterLog>;
}
