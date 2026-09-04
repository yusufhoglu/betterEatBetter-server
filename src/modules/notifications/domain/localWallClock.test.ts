import { resolveLocalWallClock } from './localWallClock';

describe('resolveLocalWallClock', () => {
  test('converts an instant to the wall-clock time in the target zone', () => {
    // 2026-09-07 is a Monday. 06:30 UTC = 09:30 in Europe/Istanbul (UTC+3).
    const result = resolveLocalWallClock(new Date('2026-09-07T06:30:00.000Z'), 'Europe/Istanbul');

    expect(result).toMatchObject({ hour: 9, minute: 30, weekday: 1, dateKey: '2026-09-07', fellBackToUtc: false });
  });

  test('rolls the local calendar date across midnight', () => {
    // 23:30 UTC on the 7th is 02:30 on the 8th in Istanbul (UTC+3, no DST).
    const result = resolveLocalWallClock(new Date('2026-09-07T23:30:00.000Z'), 'Europe/Istanbul');

    expect(result).toMatchObject({ hour: 2, minute: 30, dateKey: '2026-09-08', weekday: 2 });
  });

  test('produces an ISO week key', () => {
    const result = resolveLocalWallClock(new Date('2026-09-07T12:00:00.000Z'), 'UTC');
    expect(result.isoWeekKey).toBe('2026-W37');
  });

  test('falls back to UTC for an unresolvable zone', () => {
    const result = resolveLocalWallClock(new Date('2026-09-07T06:30:00.000Z'), 'Not/AZone');

    expect(result).toMatchObject({ hour: 6, minute: 30, fellBackToUtc: true });
  });
});
