import type {
  DayLogsPort,
  GetLoggedMealTypesForDateRangeInput,
  LoggedMealTypesByDate,
} from '../../ports/DayLogsPort';

function cloneLoggedMealTypesByDate(value: LoggedMealTypesByDate): LoggedMealTypesByDate {
  return Object.fromEntries(Object.entries(value).map(([date, mealTypes]) => [date, [...mealTypes]]));
}

export class FakeDayLogsPort implements DayLogsPort {
  readonly calls: GetLoggedMealTypesForDateRangeInput[] = [];

  constructor(private result: LoggedMealTypesByDate = {}) {}

  setResult(result: LoggedMealTypesByDate): void {
    this.result = cloneLoggedMealTypesByDate(result);
  }

  async getLoggedMealTypesForDateRange(input: GetLoggedMealTypesForDateRangeInput): Promise<LoggedMealTypesByDate> {
    this.calls.push({
      userId: input.userId,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
    });

    return cloneLoggedMealTypesByDate(this.result);
  }
}
