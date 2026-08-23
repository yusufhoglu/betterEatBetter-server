export interface GetLoggedMealTypesForDateRangeInput {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export type LoggedMealTypesByDate = Record<string, string[]>;

export interface DayLogsPort {
  getLoggedMealTypesForDateRange(input: GetLoggedMealTypesForDateRangeInput): Promise<LoggedMealTypesByDate>;
}
