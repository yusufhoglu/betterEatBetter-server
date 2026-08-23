import type { GetLoggedMealTypesForDateRange } from '../../../nutrition-logging/use-cases/GetLoggedMealTypesForDateRange';
import type { DayLogsPort, GetLoggedMealTypesForDateRangeInput, LoggedMealTypesByDate } from '../../ports/DayLogsPort';

/** Adapts the public nutrition-logging range use-case to the local port. */
export class NutritionLoggingDayLogsAdapter implements DayLogsPort {
  constructor(private readonly getLoggedMealTypesForDateRangeUseCase: GetLoggedMealTypesForDateRange) {}

  async getLoggedMealTypesForDateRange(input: GetLoggedMealTypesForDateRangeInput): Promise<LoggedMealTypesByDate> {
    return this.getLoggedMealTypesForDateRangeUseCase.execute(input.userId, input.startDate, input.endDate);
  }
}
