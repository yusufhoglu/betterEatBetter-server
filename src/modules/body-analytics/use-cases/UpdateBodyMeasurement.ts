import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';

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
