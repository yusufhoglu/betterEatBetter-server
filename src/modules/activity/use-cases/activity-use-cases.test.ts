import { InMemoryStepLogRepository } from '../test-utils/fakes/InMemoryStepLogRepository';
import { GetStepsForRange } from './GetStepsForRange';
import { SyncSteps } from './SyncSteps';

const today = new Date('2026-09-28T00:00:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('steps', () => {
  it('upserts daily totals and reads them back in order', async () => {
    const repository = new InMemoryStepLogRepository();
    const sync = new SyncSteps(repository);

    await sync.execute({ userId: 'u1', today, source: 'apple_health', days: [{ date: day('2026-09-28'), steps: 1200 }, { date: day('2026-09-27'), steps: 8400 }] });
    await sync.execute({ userId: 'u1', today, source: 'apple_health', days: [{ date: day('2026-09-28'), steps: 5300 }] });

    expect(await new GetStepsForRange(repository).execute('u1', day('2026-09-20'), today)).toEqual([
      { date: '2026-09-27', steps: 8400 },
      { date: '2026-09-28', steps: 5300 },
    ]);
  });

  it('rejects future days, days older than a month and absurd totals', async () => {
    const sync = new SyncSteps(new InMemoryStepLogRepository());
    const base = { userId: 'u1', today, source: 'health_connect' as const };

    await expect(sync.execute({ ...base, days: [{ date: day('2026-09-29'), steps: 10 }] })).rejects.toMatchObject({ code: 'STEP_DATE_OUT_OF_RANGE' });
    await expect(sync.execute({ ...base, days: [{ date: day('2026-08-01'), steps: 10 }] })).rejects.toMatchObject({ code: 'STEP_DATE_OUT_OF_RANGE' });
    await expect(sync.execute({ ...base, days: [{ date: today, steps: 250000 }] })).rejects.toMatchObject({ code: 'INVALID_STEP_COUNT' });
  });
});
