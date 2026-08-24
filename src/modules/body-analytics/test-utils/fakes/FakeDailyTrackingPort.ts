import type { DailyTrackingPort, DailyTrackingStatus } from '../../ports/DailyTrackingPort';

export class FakeDailyTrackingPort implements DailyTrackingPort {
  public calls: string[] = [];

  constructor(private readonly status: DailyTrackingStatus) {}

  async getTodayStatus(userId: string): Promise<DailyTrackingStatus> {
    this.calls.push(userId);
    return this.status;
  }
}
