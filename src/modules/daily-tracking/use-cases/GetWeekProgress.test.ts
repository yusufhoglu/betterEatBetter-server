import { GetWeekProgress } from './GetWeekProgress';
import { FakeDayLogsPort } from '../test-utils/fakes/FakeDayLogsPort';

describe('GetWeekProgress', () => {
  it('returns a full seven-day map and calls the port only once', async () => {
    const dayLogsPort = new FakeDayLogsPort({
      '2026-08-17': ['breakfast', 'lunch', 'dinner'],
      '2026-08-18': ['breakfast'],
      '2026-08-20': ['breakfast', 'lunch', 'dinner', 'snack'],
      '2026-08-23': ['breakfast', 'lunch'],
    });
    const getWeekProgress = new GetWeekProgress(dayLogsPort);

    const result = await getWeekProgress.execute({
      userId: 'user-1',
      weekStartDate: new Date('2026-08-17T15:45:00.000Z'),
    });

    expect(Object.fromEntries(result)).toEqual({
      '2026-08-17': true,
      '2026-08-18': false,
      '2026-08-19': false,
      '2026-08-20': true,
      '2026-08-21': false,
      '2026-08-22': false,
      '2026-08-23': false,
    });
    expect(dayLogsPort.calls).toHaveLength(1);
    expect(dayLogsPort.calls[0]).toEqual({
      userId: 'user-1',
      startDate: new Date('2026-08-17T00:00:00.000Z'),
      endDate: new Date('2026-08-23T00:00:00.000Z'),
    });
  });

  it('throws ValidationError for an invalid week start date', async () => {
    const getWeekProgress = new GetWeekProgress(new FakeDayLogsPort());

    await expect(
      getWeekProgress.execute({
        userId: 'user-1',
        weekStartDate: new Date('invalid'),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_WEEK_START',
      httpStatus: 400,
    });
  });
});
