export interface DailyTrackingStatus {
  date: string;
  completed: boolean;
  currentStreak: number;
  longestStreak: number;
}

export interface DailyTrackingPort {
  getTodayStatus(userId: string): Promise<DailyTrackingStatus>;
}
