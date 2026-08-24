import type { PrismaClient } from '@prisma/client';
import type { BodyMeasurement } from '../../domain/bodyAnalyticsTypes';
import type {
  BodyMeasurementRepositoryPort,
  CreateBodyMeasurementInput,
  ListBodyMeasurementsInput,
  UpdateBodyMeasurementInput,
} from '../../ports/BodyMeasurementRepositoryPort';

function toDomain(row: {
  id: string;
  userId: string;
  metric: string;
  value: number;
  unit: string;
  date: Date;
  source: string;
  createdAt: Date;
}): BodyMeasurement {
  return {
    id: row.id,
    userId: row.userId,
    metric: row.metric as BodyMeasurement['metric'],
    value: row.value,
    unit: row.unit,
    date: row.date,
    source: row.source as BodyMeasurement['source'],
    createdAt: row.createdAt,
  };
}

export class PrismaBodyMeasurementRepository implements BodyMeasurementRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async list(input: ListBodyMeasurementsInput): Promise<BodyMeasurement[]> {
    return (
      await this.db.bodyMeasurement.findMany({
        where: {
          userId: input.userId,
          metric: input.metric,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: input.limit ?? 50,
      })
    ).map(toDomain);
  }

  async findById(userId: string, id: string): Promise<BodyMeasurement | null> {
    const row = await this.db.bodyMeasurement.findFirst({ where: { id, userId } });
    return row ? toDomain(row) : null;
  }

  async create(input: CreateBodyMeasurementInput): Promise<BodyMeasurement> {
    const row = await this.db.bodyMeasurement.create({ data: input });
    return toDomain(row);
  }

  async update(input: UpdateBodyMeasurementInput): Promise<BodyMeasurement> {
    const row = await this.db.bodyMeasurement.update({
      where: { id: input.id },
      data: {
        value: input.value,
        unit: input.unit,
        date: input.date,
        source: input.source,
      },
    });
    return toDomain(row);
  }

  async delete(_userId: string, id: string): Promise<void> {
    await this.db.bodyMeasurement.delete({ where: { id } });
  }

  async findLatestByMetric(userId: string, metric: BodyMeasurement['metric']): Promise<BodyMeasurement | null> {
    const row = await this.db.bodyMeasurement.findFirst({
      where: { userId, metric },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? toDomain(row) : null;
  }

  async findForMetricInRange(userId: string, metric: BodyMeasurement['metric'], startDate: Date | null, endDate: Date): Promise<BodyMeasurement[]> {
    return (
      await this.db.bodyMeasurement.findMany({
        where: {
          userId,
          metric,
          date: {
            gte: startDate ?? undefined,
            lte: endDate,
          },
        },
        orderBy: { date: 'asc' },
      })
    ).map(toDomain);
  }
}
