import type { BodyMeasurement, BodyMeasurementMetric } from '../domain/bodyAnalyticsTypes';

export interface ListBodyMeasurementsInput {
  userId: string;
  metric?: BodyMeasurementMetric;
  limit?: number;
  cursor?: string;
}

export interface CreateBodyMeasurementInput {
  userId: string;
  metric: BodyMeasurementMetric;
  value: number;
  unit: string;
  date: Date;
  source: 'manual' | 'synced' | 'edited';
}

export interface UpdateBodyMeasurementInput {
  userId: string;
  id: string;
  value?: number;
  unit?: string;
  date?: Date;
  source: 'manual' | 'synced' | 'edited';
}

export interface BodyMeasurementRepositoryPort {
  list(input: ListBodyMeasurementsInput): Promise<BodyMeasurement[]>;
  findById(userId: string, id: string): Promise<BodyMeasurement | null>;
  create(input: CreateBodyMeasurementInput): Promise<BodyMeasurement>;
  update(input: UpdateBodyMeasurementInput): Promise<BodyMeasurement>;
  delete(userId: string, id: string): Promise<void>;
  findLatestByMetric(userId: string, metric: BodyMeasurementMetric): Promise<BodyMeasurement | null>;
  findForMetricInRange(userId: string, metric: BodyMeasurementMetric, startDate: Date | null, endDate: Date): Promise<BodyMeasurement[]>;
}
