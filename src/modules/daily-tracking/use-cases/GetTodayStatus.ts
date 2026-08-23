import { ValidationError } from '../../../shared/errors/ValidationError';
import { resolveUserToday } from '../../../shared/domain/resolveUserToday';
import { computeStreak } from '../domain/ComputeStreak';
import { defineDayCompletion } from '../domain/DefineDayCompletion';
import type { DayLogsPort } from '../ports/DayLogsPort';

const DEFAULT_STREAK_WINDOW_DAYS = 60;
const defaultResolveUserToday = resolveUserToday as unknown as () => Date;

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

export interface GetTodayStatusInput {
  userId: string;
}

export interface TodayStatus {
  date: string;
  completed: boolean;
  currentStreak: number;
  longestStreak: number;
}

/** Resolves today's completion and streak values from historical meal logs. */
export class GetTodayStatus {
  constructor(
    private readonly dayLogsPort: DayLogsPort,
    private readonly resolveToday: () => Date = defaultResolveUserToday,
    private readonly streakWindowDays: number = DEFAULT_STREAK_WINDOW_DAYS,
  ) {}

  async execute(input: GetTodayStatusInput): Promise<TodayStatus> {
    if (!input.userId) {
      throw new ValidationError('USER_ID_REQUIRED', 'userId is required');
    }

    if (this.streakWindowDays < 1) {
      throw new ValidationError('INVALID_STREAK_WINDOW', 'streakWindowDays must be at least 1');
    }

    const today = startOfUtcDay(this.resolveToday());
    const startDate = addUtcDays(today, -(this.streakWindowDays - 1));
    const logsByDate = await this.dayLogsPort.getLoggedMealTypesForDateRange({
      userId: input.userId,
      startDate,
      endDate: today,
    });

    const completions: boolean[] = [];
    for (let offset = 0; offset < this.streakWindowDays; offset += 1) {
      const date = addUtcDays(startDate, offset);
      completions.push(defineDayCompletion(logsByDate[toDateKey(date)] ?? []));
    }

    const todayKey = toDateKey(today);
    const streak = computeStreak(completions);

    return {
      date: todayKey,
      completed: defineDayCompletion(logsByDate[todayKey] ?? []),
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
    };
  }
}
