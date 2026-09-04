export interface WeeklySummary {
  /** Fully-logged days in the last 7 (0-7). */
  daysCompleted: number;
  currentStreak: number;
  /** Mean daily calories over the last 7 days, rounded. */
  avgCalories: number;
}

/** Read-only bridge to `daily-tracking` + `body-analytics` for the weekly-report job. */
export interface WeeklySummaryPort {
  getForUser(userId: string): Promise<WeeklySummary>;
}
