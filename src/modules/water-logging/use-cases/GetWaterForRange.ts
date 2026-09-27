import type { WaterLogRepositoryPort } from '../ports/WaterLogRepositoryPort';

/** Public entry point for analytics: daily totals in an inclusive range; missing days are omitted. */
export class GetWaterForRange {
  constructor(private readonly repository: WaterLogRepositoryPort) {}

  async execute(userId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; amountMl: number }>> {
    const logs = await this.repository.findInRange(userId, startDate, endDate);
    return logs.map((log) => ({ date: log.date.toISOString().slice(0, 10), amountMl: log.amountMl }));
  }
}
