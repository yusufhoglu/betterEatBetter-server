import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import { unitForMetric } from './bodyAnalyticsShared';

export interface UpdateBodyMeasurementInput {
  value?: number;
  unit?: string;
  date?: Date;
}

export class UpdateBodyMeasurement {
  constructor(private readonly repository: BodyMeasurementRepositoryPort) {}

  async execute(userId: string, id: string, input: UpdateBodyMeasurementInput) {
    const existing = await this.repository.findById(userId, id);
    if (!existing) {
      throw new NotFoundError('BODY_MEASUREMENT_NOT_FOUND', 'Body measurement was not found');
    }

    if (input.unit !== undefined && input.unit !== unitForMetric(existing.metric)) {
      throw new ValidationError('INVALID_UNIT', `unit must be ${unitForMetric(existing.metric)} for ${existing.metric}`);
    }

    return this.repository.update({
      userId,
      id,
      value: input.value,
      unit: input.unit,
      date: input.date,
      source: 'edited',
    });
  }
}
