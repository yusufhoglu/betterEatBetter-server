import type { WaterLog } from '../../domain/WaterLog';
import type { WaterLogRepositoryPort } from '../../ports/WaterLogRepositoryPort';

function normalizeDate(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export class InMemoryWaterLogRepository implements WaterLogRepositoryPort {
  private readonly logs = new Map<string, WaterLog>();

  private key(userId: string, date: Date): string {
    return `${userId}|${normalizeDate(date).toISOString()}`;
  }

  async findByUserIdAndDate(userId: string, date: Date): Promise<WaterLog | null> {
    return this.logs.get(this.key(userId, date)) ?? null;
  }

  async addAmount(userId: string, date: Date, amountMl: number): Promise<WaterLog> {
    const key = this.key(userId, date);
    const normalizedDate = normalizeDate(date);
    const existing = this.logs.get(key);
    const updated: WaterLog = existing
      ? { ...existing, amountMl: Math.max(0, existing.amountMl + amountMl), updatedAt: new Date() }
      : {
          id: `water-${this.logs.size + 1}`,
          userId,
          date: normalizedDate,
          amountMl: Math.max(0, amountMl),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    this.logs.set(key, updated);
    return updated;
  }
}
