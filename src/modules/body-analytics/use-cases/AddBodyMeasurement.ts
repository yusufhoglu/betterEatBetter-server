import { ValidationError } from '../../../shared/errors/ValidationError';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';
import { assertBodyMeasurementMetric, unitForMetric } from './bodyAnalyticsShared';

export interface AddBodyMeasurementInput {
  metric: string;
  value: number;
  unit: string;
  date: Date;
}

export class AddBodyMeasurement {
  constructor(private readonly repository: BodyMeasurementRepositoryPort) {}

  async execute(userId: string, input: AddBodyMeasurementInput) {
    assertBodyMeasurementMetric(input.metric);

    if (input.value <= 0) {
      throw new ValidationError('INVALID_VALUE', 'value must be positive');
    }

    if (input.unit !== unitForMetric(input.metric)) {
      throw new ValidationError('INVALID_UNIT', `unit must be ${unitForMetric(input.metric)} for ${input.metric}`);
    }

    return this.repository.create({
      userId,
      metric: input.metric,
      value: input.value,
      unit: input.unit,
      date: input.date,
      source: 'manual',
    });
  }
}
