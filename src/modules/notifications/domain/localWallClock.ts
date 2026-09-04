export interface LocalWallClock {
  /** 0-23 in the target zone. */
  hour: number;
  /** 0-59 in the target zone. */
  minute: number;
  /** 0 = Sunday .. 6 = Saturday, matching `Date.prototype.getUTCDay`. */
  weekday: number;
  /** Calendar date in the target zone, `YYYY-MM-DD`. */
  dateKey: string;
  /** ISO-8601 week identifier in the target zone, e.g. `2026-W36`. */
  isoWeekKey: string;
  /** True when `timeZone` could not be resolved and UTC was used instead. */
  fellBackToUtc: boolean;
}

function isoWeekKey(year: number, month: number, day: number): string {
  // Standard ISO-8601 week-number algorithm, computed in UTC.
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // Mon = 0 .. Sun = 6
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function readParts(now: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/**
 * Resolves the wall-clock time in `timeZone` for a given instant. Every
 * scheduled notification job uses this to decide whether "now" matches a
 * user's chosen reminder time, streak-saver hour, or weekly-report slot — the
 * comparison always happens in the user's own zone, never server time.
 *
 * An unresolvable `timeZone` falls back to UTC (with `fellBackToUtc: true`)
 * rather than throwing, so a single bad row can't take a whole job run down.
 */
export function resolveLocalWallClock(now: Date, timeZone: string): LocalWallClock {
  let fellBackToUtc = false;
  let zone = timeZone;

  let parts: ReturnType<typeof readParts>;
  try {
    parts = readParts(now, zone);
    if (Number.isNaN(parts.year)) {
      throw new Error('unresolved time zone parts');
    }
  } catch {
    fellBackToUtc = true;
    zone = 'UTC';
    parts = readParts(now, zone);
  }

  const { year, month, day, hour, minute } = parts;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    hour,
    minute,
    weekday,
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    isoWeekKey: isoWeekKey(year, month, day),
    fellBackToUtc,
  };
}
