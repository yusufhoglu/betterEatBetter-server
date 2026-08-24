import { resolveUserToday } from './resolveUserToday';

describe('resolveUserToday', () => {
  test('returns UTC midnight for the same calendar day when using UTC', () => {
    const result = resolveUserToday({
      now: new Date('2026-08-24T10:15:00.000Z'),
      timeZone: 'UTC',
    });

    expect(result.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  test('moves to the next calendar day when the timezone is ahead of UTC', () => {
    const result = resolveUserToday({
      now: new Date('2026-08-24T22:30:00.000Z'),
      timeZone: 'Europe/Istanbul',
    });

    expect(result.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  test('keeps the previous calendar day when the timezone is behind UTC', () => {
    const result = resolveUserToday({
      now: new Date('2026-08-24T02:30:00.000Z'),
      timeZone: 'America/Los_Angeles',
    });

    expect(result.toISOString()).toBe('2026-08-23T00:00:00.000Z');
  });

  test('throws ValidationError for an invalid timezone', () => {
    expect(() =>
      resolveUserToday({
        now: new Date('2026-08-24T10:15:00.000Z'),
        timeZone: 'Mars/Olympus',
      }),
    ).toThrow('timeZone must be a valid IANA timezone');
  });
});
