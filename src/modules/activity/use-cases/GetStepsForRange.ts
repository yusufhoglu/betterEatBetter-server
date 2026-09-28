import type { StepLogRepositoryPort } from '../ports/StepLogRepositoryPort';

/** Public entry point (practice analytics, the app's own charts). Days without data are omitted. */
export class GetStepsForRange {
  constructor(private readonly repository: StepLogRepositoryPort) {}

  async execute(userId: string, from: Date, to: Date): Promise<Array<{ date: string; steps: number }>> {
    const rows = await this.repository.findInRange(userId, from, to);
    return rows.map((row) => ({ date: row.date.toISOString().slice(0, 10), steps: row.steps }));
  }
}
