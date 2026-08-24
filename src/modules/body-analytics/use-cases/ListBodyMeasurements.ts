import type { BodyMeasurementRepositoryPort } from '../ports/BodyMeasurementRepositoryPort';

export class ListBodyMeasurements {
  constructor(private readonly repository: BodyMeasurementRepositoryPort) {}

  async execute(userId: string, input: { metric?: string; limit?: number; cursor?: string }) {
    return {
      items: await this.repository.list({
        userId,
        metric: input.metric as never,
        limit: input.limit,
        cursor: input.cursor,
      }),
    };
  }
}
