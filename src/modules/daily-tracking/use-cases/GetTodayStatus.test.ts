import { GetTodayStatus } from './GetTodayStatus';
import { FakeDayLogsPort } from '../test-utils/fakes/FakeDayLogsPort';

describe('GetTodayStatus', () => {
  it('computes todays completion and streak from a single range read', async () => {
    const dayLogsPort = new FakeDayLogsPort({
      '2026-08-19': ['breakfast', 'lunch', 'dinner'],
      '2026-08-20': ['breakfast', 'lunch', 'dinner'],
      '2026-08-21': ['breakfast', 'dinner'],
      '2026-08-22': ['breakfast', 'lunch', 'dinner'],
      '2026-08-23': ['breakfast', 'lunch'],
    });
    const getTodayStatus = new GetTodayStatus(dayLogsPort, () => new Date('2026-08-23T12:00:00.000Z'), 5);

    await expect(getTodayStatus.execute({ userId: 'user-1' })).resolves.toEqual({
      date: '2026-08-23',
      completed: false,
      currentStreak: 1,
      longestStreak: 2,
    });

    expect(dayLogsPort.calls).toHaveLength(1);
    expect(dayLogsPort.calls[0]).toEqual({
      userId: 'user-1',
      startDate: new Date('2026-08-19T00:00:00.000Z'),
      endDate: new Date('2026-08-23T00:00:00.000Z'),
    });
  });

  it('throws ValidationError when userId is empty', async () => {
    const getTodayStatus = new GetTodayStatus(new FakeDayLogsPort(), () => new Date('2026-08-23T00:00:00.000Z'));

    await expect(getTodayStatus.execute({ userId: '' })).rejects.toMatchObject({
      code: 'USER_ID_REQUIRED',
      httpStatus: 400,
    });
  });
});
