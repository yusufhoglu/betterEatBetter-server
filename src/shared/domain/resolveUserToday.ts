import { ValidationError } from '../errors/ValidationError';

export interface ResolveUserTodayOptions {
  now?: Date;
  timeZone?: string;
}

function resolveDefaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function toDateParts(date: Date, timeZone: string): { year: string; month: string; day: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new ValidationError('INVALID_TIMEZONE', 'timeZone could not be resolved');
  }

  return { year, month, day };
}

/**
 * Returns the user's current calendar day as a canonical UTC midnight date.
 * Example: if the user is already in the next day in Europe/Istanbul, this
 * returns `YYYY-MM-DDT00:00:00.000Z` for that local calendar date.
 */
export function resolveUserToday(options: ResolveUserTodayOptions = {}): Date {
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new ValidationError('INVALID_NOW', 'now must be a valid date');
  }

  const timeZone = options.timeZone ?? resolveDefaultTimeZone();

  try {
    const { year, month, day } = toDateParts(now, timeZone);
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }

    throw new ValidationError('INVALID_TIMEZONE', 'timeZone must be a valid IANA timezone');
  }
}
