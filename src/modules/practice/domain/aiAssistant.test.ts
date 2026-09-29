import {
  clientHasAi,
  defaultAiSettings,
  exampleTokens,
  isWithinSchedule,
  nextScheduleOpening,
  selectExamples,
  type AiExample,
  type AiSchedule,
} from './aiAssistant';

const IST = 'Europe/Istanbul'; // UTC+3, no DST

/** 2026-09-28 is a Monday. `at('2026-09-28', '18:30')` = that local time in Istanbul. */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+03:00`);
}

describe('clientHasAi', () => {
  const on = { ...defaultAiSettings('d1'), enabled: true };

  it('is off whenever the master switch is off, regardless of the client override', () => {
    expect(clientHasAi(defaultAiSettings('d1'), { linkId: 'l', access: 'on', instructions: null })).toBe(false);
  });

  it('follows the dietitian default when the client has no override', () => {
    expect(clientHasAi(on, null)).toBe(true);
    expect(clientHasAi({ ...on, defaultClientAccess: false }, null)).toBe(false);
    expect(clientHasAi(on, { linkId: 'l', access: null, instructions: 'x' })).toBe(true);
  });

  it('lets a per-client override win over the default', () => {
    expect(clientHasAi(on, { linkId: 'l', access: 'off', instructions: null })).toBe(false);
    expect(clientHasAi({ ...on, defaultClientAccess: false }, { linkId: 'l', access: 'on', instructions: null })).toBe(true);
  });
});

describe('schedule', () => {
  const evenings: AiSchedule = { timeZone: IST, windows: [{ days: [1, 2, 3, 4, 5], start: '18:00', end: '09:00' }] };

  it('null schedule is always open', () => {
    expect(isWithinSchedule(null, at('2026-09-28', '12:00'))).toBe(true);
    expect(nextScheduleOpening(null, at('2026-09-28', '12:00'))).toEqual(at('2026-09-28', '12:00'));
  });

  it('handles an overnight window across midnight, in the schedule time zone', () => {
    expect(isWithinSchedule(evenings, at('2026-09-28', '17:59'))).toBe(false); // Mon
    expect(isWithinSchedule(evenings, at('2026-09-28', '18:00'))).toBe(true);
    expect(isWithinSchedule(evenings, at('2026-09-29', '08:59'))).toBe(true); // Tue morning, from Mon night
    expect(isWithinSchedule(evenings, at('2026-09-29', '09:00'))).toBe(false);
  });

  it('an overnight window on Friday runs into Saturday but a weekend day is otherwise closed', () => {
    expect(isWithinSchedule(evenings, at('2026-10-03', '08:00'))).toBe(true); // Sat morning
    expect(isWithinSchedule(evenings, at('2026-10-03', '20:00'))).toBe(false); // Sat evening
    // Sunday night wraps to Monday morning only if Sunday is listed — it is not.
    expect(isWithinSchedule(evenings, at('2026-09-28', '08:00'))).toBe(false);
  });

  it('equal start and end means the whole day', () => {
    const sundays: AiSchedule = { timeZone: IST, windows: [{ days: [7], start: '00:00', end: '00:00' }] };
    expect(isWithinSchedule(sundays, at('2026-10-04', '00:00'))).toBe(true);
    expect(isWithinSchedule(sundays, at('2026-10-04', '23:59'))).toBe(true);
    expect(isWithinSchedule(sundays, at('2026-10-05', '00:00'))).toBe(false);
  });

  it('finds the next opening, wrapping over the week end', () => {
    expect(nextScheduleOpening(evenings, at('2026-09-28', '12:34'))).toEqual(at('2026-09-28', '18:00'));
    // Saturday afternoon → next Monday 18:00.
    expect(nextScheduleOpening(evenings, at('2026-10-03', '15:00'))).toEqual(at('2026-10-05', '18:00'));
  });

  it('respects the time zone of the schedule, not the server', () => {
    const london: AiSchedule = { timeZone: 'Europe/London', windows: [{ days: [1], start: '09:00', end: '10:00' }] };
    // 2026-09-28 is BST (UTC+1): 09:30 London = 08:30 UTC.
    expect(isWithinSchedule(london, new Date('2026-09-28T08:30:00Z'))).toBe(true);
    expect(isWithinSchedule(london, new Date('2026-09-28T09:30:00Z'))).toBe(false);
  });

  it('a schedule with no windows never opens', () => {
    expect(nextScheduleOpening({ timeZone: IST, windows: [] }, at('2026-09-28', '12:00'))).toBeNull();
  });
});

describe('selectExamples', () => {
  let seq = 0;
  function example(question: string, daysAgo: number): AiExample {
    const createdAt = new Date(Date.UTC(2026, 8, 28 - daysAgo));
    return {
      id: `e${++seq}`,
      dietitianId: 'd1',
      question,
      answer: `answer to ${question}`,
      source: 'manual',
      sourceMessageId: null,
      createdAt,
      updatedAt: createdAt,
    };
  }

  it('folds Turkish characters and stems suffixes', () => {
    expect(exampleTokens('Kahvaltıda YUMURTA yiyebilir miyim?')).toEqual(new Set(['kahva', 'yumur', 'yiyeb', 'miyim']));
    expect(exampleTokens('İştah')).toEqual(exampleTokens('istah'));
  });

  it('puts the most relevant examples first', () => {
    const breakfast = example('Kahvaltıda ne yemeliyim?', 10);
    const eggs = example('Yumurta kaç tane yiyebilirim kahvaltıda?', 20);
    const water = example('Günde kaç litre su içmeliyim?', 1);
    const picked = selectExamples([breakfast, eggs, water], 'Kahvaltıda yumurta yiyebilir miyim?', 2, 0);
    expect(picked.map((e) => e.id)).toEqual([eggs.id, breakfast.id]);
  });

  it('tops up with the newest examples for style when few match', () => {
    const old = example('Tatlı krizinde ne yapmalıyım?', 30);
    const newer = example('Spor sonrası ne yemeliyim?', 2);
    const newest = example('Akşam yemeği saat kaçta olmalı?', 1);
    const picked = selectExamples([old, newer, newest], 'Tatlı krizi geldi', 5, 3);
    expect(picked.map((e) => e.id)).toEqual([old.id, newest.id, newer.id]);
  });

  it('never exceeds the limit and handles no examples', () => {
    const many = Array.from({ length: 20 }, (_, i) => example(`Protein soru ${i}`, i));
    expect(selectExamples(many, 'protein', 5, 3)).toHaveLength(5);
    expect(selectExamples([], 'protein')).toEqual([]);
  });
});
