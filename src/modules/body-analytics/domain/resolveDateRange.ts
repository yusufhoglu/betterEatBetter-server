import type { MeasurementRange, MealRange } from './bodyAnalyticsTypes';

export type AnalyticsRange = MeasurementRange | MealRange;

export interface ResolvedDateRange {
  startDate: Date | null;
  endDate: Date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function endOfUtcDay(date: Date): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/**
 * Body measurements and meal analytics expose different public enums, but both
 * collapse into the same internal {startDate, endDate} shape.
 */
export function resolveDateRange(range: AnalyticsRange, now: Date = new Date()): ResolvedDateRange {
  const endDate = endOfUtcDay(now);
  const endDay = startOfUtcDay(now);

  switch (range) {
    case '1W':
      return { startDate: addUtcDays(endDay, -6), endDate };
    case '1M':
      return { startDate: addUtcMonths(endDay, -1), endDate };
    case '3M':
      return { startDate: addUtcMonths(endDay, -3), endDate };
    case '6M':
      return { startDate: addUtcMonths(endDay, -6), endDate };
    case '1Y':
      return { startDate: addUtcMonths(endDay, -12), endDate };
    case 'All':
      return { startDate: null, endDate };
    case 'week':
      return { startDate: addUtcDays(endDay, -6), endDate };
    case 'month':
      return { startDate: addUtcMonths(endDay, -1), endDate };
    case 'threeMonths':
      return { startDate: addUtcMonths(endDay, -3), endDate };
    case 'sixMonths':
      return { startDate: addUtcMonths(endDay, -6), endDate };
    case 'year':
      return { startDate: addUtcMonths(endDay, -12), endDate };
    case 'allTime':
      return { startDate: null, endDate };
  }
}
