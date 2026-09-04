import type { GetTodayStatus } from '../../../daily-tracking/use-cases/GetTodayStatus';
import type { DayCompletionPort, TodayCompletion } from '../../ports/DayCompletionPort';

/** Adapts `daily-tracking`'s public GetTodayStatus use-case to the local port. */
export class DailyTrackingCompletionAdapter implements DayCompletionPort {
  constructor(private readonly getTodayStatusUseCase: GetTodayStatus) {}

  async getTodayStatus(userId: string): Promise<TodayCompletion> {
    const status = await this.getTodayStatusUseCase.execute({ userId });
    return { completed: status.completed, currentStreak: status.currentStreak };
  }
}
