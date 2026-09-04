export interface TodayCompletion {
  completed: boolean;
  currentStreak: number;
}

/** Read-only bridge to `daily-tracking` for the streak-saver job. */
export interface DayCompletionPort {
  getTodayStatus(userId: string): Promise<TodayCompletion>;
}
