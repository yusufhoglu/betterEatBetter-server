import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';

export class DeleteBodyMeasurement {
  constructor(private readonly repository: BodyMeasurementRepositoryPort) {}

  async execute(userId: string, id: string): Promise<void> {
    await this.repository.delete(userId, id);
  }
}
