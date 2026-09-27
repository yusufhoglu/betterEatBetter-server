import type { StepLog, StepSource } from '../../domain/StepLog';
import type { StepLogRepositoryPort } from '../../ports/StepLogRepositoryPort';

export class InMemoryStepLogRepository implements StepLogRepositoryPort {
  readonly rows = new Map<string, StepLog>();

  async upsertMany(userId: string, days: Array<{ date: Date; steps: number; source: StepSource }>): Promise<void> {
    for (const day of days) {
      this.rows.set(`${userId}|${day.date.toISOString()}`, { userId, ...day, updatedAt: new Date() });
    }
  }

  async findInRange(userId: string, from: Date, to: Date): Promise<StepLog[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.date >= from && r.date <= to)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
