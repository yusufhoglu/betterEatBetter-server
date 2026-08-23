// TODO: Bir gunun tamamlanma durumu value object
export interface DayCompletion {
  date: string;
  completed: boolean;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
}
