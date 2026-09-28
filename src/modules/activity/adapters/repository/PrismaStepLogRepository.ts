import type { PrismaClient } from '@prisma/client';
import type { StepLog, StepSource } from '../../domain/StepLog';
import type { StepLogRepositoryPort } from '../../ports/StepLogRepositoryPort';

export class PrismaStepLogRepository implements StepLogRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async upsertMany(userId: string, days: Array<{ date: Date; steps: number; source: StepSource }>): Promise<void> {
    await this.db.$transaction(
      days.map((day) =>
        this.db.stepLog.upsert({
          where: { userId_date: { userId, date: day.date } },
          create: { userId, date: day.date, steps: day.steps, source: day.source },
          update: { steps: day.steps, source: day.source },
        }),
      ),
    );
  }

  async findInRange(userId: string, from: Date, to: Date): Promise<StepLog[]> {
    const rows = await this.db.stepLog.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => ({
      userId: row.userId,
      date: row.date,
      steps: row.steps,
      source: row.source as StepSource,
      updatedAt: row.updatedAt,
    }));
  }
}
