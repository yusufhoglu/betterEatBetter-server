import type { GetTodayStatus } from '../../../daily-tracking/use-cases/GetTodayStatus';
import type { DailyTrackingPort } from '../../ports/DailyTrackingPort';

export class DailyTrackingAdapter implements DailyTrackingPort {
  constructor(private readonly getTodayStatusUseCase: GetTodayStatus) {}

  async getTodayStatus(userId: string) {
    return this.getTodayStatusUseCase.execute({ userId });
  }
}
