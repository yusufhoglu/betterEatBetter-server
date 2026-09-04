import type { DeviceToken } from '../domain/DeviceToken';
import { FakePushSender } from '../test-utils/fakes/FakePushSender';
import { InMemoryDeviceTokenRepository } from '../test-utils/fakes/InMemoryDeviceTokenRepository';
import { FakeNotificationPreferences, FakeSendGuard, FakeWeeklySummary } from '../test-utils/fakes/notificationFakes';
import { SendPushToUser } from '../use-cases/SendPushToUser';
import { WeeklyReportJob } from './WeeklyReportJob';

// 06:00 UTC == 09:00 Europe/Istanbul on Monday 2026-09-07 (weekday 1, hour 9).
const MONDAY_MORNING = new Date('2026-09-07T06:00:00.000Z');

function device(overrides: Partial<DeviceToken> = {}): DeviceToken {
  return {
    id: 't1',
    userId: 'user-1',
    platform: 'android',
    token: 't1',
    timezone: 'Europe/Istanbul',
    locale: 'en',
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildJob(
  repository: InMemoryDeviceTokenRepository,
  summary: FakeWeeklySummary,
  prefs = new FakeNotificationPreferences(),
  guard = new FakeSendGuard(),
) {
  const sender = new FakePushSender();
  const job = new WeeklyReportJob(repository, prefs, summary, new SendPushToUser(repository, sender), guard, 1, 9);
  return { job, sender };
}

describe('WeeklyReportJob', () => {
  test('sends the weekly digest at the configured local slot, once per ISO week', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const summary = new FakeWeeklySummary();
    summary.set('user-1', { daysCompleted: 5, currentStreak: 9, avgCalories: 1950 });
    const { job, sender } = buildJob(repository, summary);

    const first = await job.execute(MONDAY_MORNING);
    expect(first.sent).toBe(1);
    expect(sender.sent[0]?.body).toContain('5/7');

    const later = await job.execute(new Date('2026-09-07T06:30:00.000Z')); // still 09:xx, same week
    expect(later.sent).toBe(0);
  });

  test('does not fire on other weekdays or hours', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const { job, sender } = buildJob(repository, new FakeWeeklySummary());

    await job.execute(new Date('2026-09-08T06:00:00.000Z')); // Tuesday
    await job.execute(new Date('2026-09-07T09:00:00.000Z')); // Monday 12:00 Istanbul
    expect(sender.sent).toHaveLength(0);
  });

  test('honours the weeklyReport preference', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const prefs = new FakeNotificationPreferences();
    prefs.set('user-1', { weeklyReport: false });
    const { job, sender } = buildJob(repository, new FakeWeeklySummary(), prefs);

    await job.execute(MONDAY_MORNING);
    expect(sender.sent).toHaveLength(0);
  });
});
