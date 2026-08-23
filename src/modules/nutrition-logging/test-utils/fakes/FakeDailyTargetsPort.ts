import type { DailyTargets, DailyTargetsPort } from '../../ports/DailyTargetsPort';

export class FakeDailyTargetsPort implements DailyTargetsPort {
  private readonly targetsByUserId = new Map<string, DailyTargets | null>();

  async getDailyTargets(userId: string): Promise<DailyTargets | null> {
    return this.targetsByUserId.get(userId) ?? null;
  }

  setTargets(userId: string, targets: DailyTargets | null): void {
    this.targetsByUserId.set(userId, targets);
  }
}
