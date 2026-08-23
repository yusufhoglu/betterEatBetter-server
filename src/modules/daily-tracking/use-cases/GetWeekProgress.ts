import { ValidationError } from '../../../shared/errors/ValidationError';
import { defineDayCompletion } from '../domain/DefineDayCompletion';
import type { DayLogsPort } from '../ports/DayLogsPort';

function startOfUtcDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface GetWeekProgressInput {
  userId: string;
  weekStartDate: Date;
}

/** Builds a seven-day completion map with a single range query. */
export class GetWeekProgress {
  constructor(private readonly dayLogsPort: DayLogsPort) {}

  async execute(input: GetWeekProgressInput): Promise<Map<string, boolean>> {
    if (!input.userId) {
      throw new ValidationError('USER_ID_REQUIRED', 'userId is required');
    }

    if (Number.isNaN(input.weekStartDate.getTime())) {
      throw new ValidationError('INVALID_WEEK_START', 'weekStartDate must be a valid date');
    }

    const weekStartDate = startOfUtcDay(input.weekStartDate);
    const weekEndDate = addUtcDays(weekStartDate, 6);
    const logsByDate = await this.dayLogsPort.getLoggedMealTypesForDateRange({
      userId: input.userId,
      startDate: weekStartDate,
      endDate: weekEndDate,
    });

    const progress = new Map<string, boolean>();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addUtcDays(weekStartDate, offset);
      progress.set(toDateKey(date), defineDayCompletion(logsByDate[toDateKey(date)] ?? []));
    }

    return progress;
  }
}
