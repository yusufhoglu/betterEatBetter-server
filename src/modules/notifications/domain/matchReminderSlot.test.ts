import { ValidationError } from '../../../shared/errors/ValidationError';
import { matchReminderSlot, parseHhMm } from './matchReminderSlot';

describe('parseHhMm', () => {
  test('parses HH:MM to minutes past midnight', () => {
    expect(parseHhMm('08:30')).toBe(510);
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('23:59')).toBe(1439);
  });

  test('rejects malformed values', () => {
    expect(() => parseHhMm('8:30')).toThrow(ValidationError);
    expect(() => parseHhMm('24:00')).toThrow(ValidationError);
    expect(() => parseHhMm('nope')).toThrow(ValidationError);
  });
});

describe('matchReminderSlot', () => {
  test('matches inside the half-open slot [target, target + width)', () => {
    expect(matchReminderSlot({ hour: 8, minute: 30 }, '08:30', 15)).toBe(true);
    expect(matchReminderSlot({ hour: 8, minute: 44 }, '08:30', 15)).toBe(true);
  });

  test('does not match before the target or at/after the slot end', () => {
    expect(matchReminderSlot({ hour: 8, minute: 29 }, '08:30', 15)).toBe(false);
    expect(matchReminderSlot({ hour: 8, minute: 45 }, '08:30', 15)).toBe(false);
  });
});
