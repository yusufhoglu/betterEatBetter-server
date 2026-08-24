import { resolveDateRange } from './resolveDateRange';

describe('resolveDateRange', () => {
  const now = new Date('2026-08-24T12:30:00.000Z');

  it.each([
    ['1W', '2026-08-18'],
    ['1M', '2026-07-24'],
    ['3M', '2026-05-24'],
    ['6M', '2026-02-24'],
    ['1Y', '2025-08-24'],
    ['week', '2026-08-18'],
    ['month', '2026-07-24'],
    ['threeMonths', '2026-05-24'],
    ['sixMonths', '2026-02-24'],
    ['year', '2025-08-24'],
  ])('resolves %s to the expected start date', (range, expected) => {
    const result = resolveDateRange(range as never, now);
    expect(result.startDate?.toISOString().slice(0, 10)).toBe(expected);
    expect(result.endDate.toISOString()).toBe('2026-08-24T23:59:59.999Z');
  });

  it.each(['All', 'allTime'])('keeps startDate open-ended for %s', (range) => {
    expect(resolveDateRange(range as never, now).startDate).toBeNull();
  });
});
