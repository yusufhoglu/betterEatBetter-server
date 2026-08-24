import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { BodyMeasurement } from '../../domain/bodyAnalyticsTypes';
import type {
  BodyMeasurementRepositoryPort,
  CreateBodyMeasurementInput,
  ListBodyMeasurementsInput,
  UpdateBodyMeasurementInput,
} from '../../ports/BodyMeasurementRepositoryPort';

export class InMemoryBodyMeasurementRepository implements BodyMeasurementRepositoryPort {
  constructor(private readonly items: BodyMeasurement[] = []) {}

  async list(input: ListBodyMeasurementsInput): Promise<BodyMeasurement[]> {
    const filtered = this.items
      .filter((item) => item.userId === input.userId && (!input.metric || item.metric === input.metric))
      .sort((left, right) => right.date.getTime() - left.date.getTime());
    return filtered.slice(0, input.limit ?? filtered.length);
  }

  async findById(userId: string, id: string): Promise<BodyMeasurement | null> {
    return this.items.find((item) => item.userId === userId && item.id === id) ?? null;
  }

  async create(input: CreateBodyMeasurementInput): Promise<BodyMeasurement> {
    const created: BodyMeasurement = {
      id: `measurement-${this.items.length + 1}`,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      ...input,
    };
    this.items.push(created);
    return created;
  }

  async update(input: UpdateBodyMeasurementInput): Promise<BodyMeasurement> {
    const existing = await this.findById(input.userId, input.id);
    if (!existing) {
      throw new NotFoundError('BODY_MEASUREMENT_NOT_FOUND', 'Body measurement was not found');
    }

    existing.value = input.value ?? existing.value;
    existing.unit = input.unit ?? existing.unit;
    existing.date = input.date ?? existing.date;
    existing.source = input.source;
    return existing;
  }

  async delete(userId: string, id: string): Promise<void> {
    const index = this.items.findIndex((item) => item.userId === userId && item.id === id);
    if (index === -1) {
      throw new NotFoundError('BODY_MEASUREMENT_NOT_FOUND', 'Body measurement was not found');
    }
    this.items.splice(index, 1);
  }

  async findLatestByMetric(userId: string, metric: BodyMeasurement['metric']): Promise<BodyMeasurement | null> {
    const filtered = this.items
      .filter((item) => item.userId === userId && item.metric === metric)
      .sort((left, right) => right.date.getTime() - left.date.getTime());
    return filtered[0] ?? null;
  }

  async findForMetricInRange(userId: string, metric: BodyMeasurement['metric'], startDate: Date | null, endDate: Date): Promise<BodyMeasurement[]> {
    return this.items
      .filter((item) => {
        if (item.userId !== userId || item.metric !== metric) {
          return false;
        }

        if (startDate && item.date < startDate) {
          return false;
        }

        return item.date <= endDate;
      })
      .sort((left, right) => left.date.getTime() - right.date.getTime());
  }
}
