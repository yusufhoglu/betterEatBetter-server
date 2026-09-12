import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { WaterLog } from '../../domain/WaterLog';
import type { WaterLogRepositoryPort } from '../../ports/WaterLogRepositoryPort';

function normalizeDate(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function mapWaterLog(row: {
  id: string;
  userId: string;
  date: Date;
  amountMl: number;
  createdAt: Date;
  updatedAt: Date;
}): WaterLog {
  return { ...row };
}

function isKnownPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export class PrismaWaterLogRepository implements WaterLogRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findByUserIdAndDate(userId: string, date: Date): Promise<WaterLog | null> {
    const row = await this.db.waterLog.findUnique({
      where: { userId_date: { userId, date: normalizeDate(date) } },
    });
    return row ? mapWaterLog(row) : null;
  }

  async addAmount(userId: string, date: Date, amountMl: number): Promise<WaterLog> {
    const normalizedDate = normalizeDate(date);
    const existing = await this.db.waterLog.findUnique({
      where: { userId_date: { userId, date: normalizedDate } },
    });

    if (existing) {
      const updated = await this.db.waterLog.update({
        where: { id: existing.id },
        data: { amountMl: Math.max(0, existing.amountMl + amountMl) },
      });
      return mapWaterLog(updated);
    }

    try {
      const created = await this.db.waterLog.create({
        data: { userId, date: normalizedDate, amountMl: Math.max(0, amountMl) },
      });
      return mapWaterLog(created);
    } catch (err) {
      if (!isKnownPrismaError(err) || err.code !== 'P2002') {
        throw err;
      }

      // Another request created the row concurrently — fall back to an update.
      const concurrent = await this.db.waterLog.findUniqueOrThrow({
        where: { userId_date: { userId, date: normalizedDate } },
      });
      const updated = await this.db.waterLog.update({
        where: { id: concurrent.id },
        data: { amountMl: Math.max(0, concurrent.amountMl + amountMl) },
      });
      return mapWaterLog(updated);
    }
  }
}
