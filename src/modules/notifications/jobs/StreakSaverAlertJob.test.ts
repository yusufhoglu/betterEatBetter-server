import type { DeviceToken } from '../domain/DeviceToken';
import { FakePushSender } from '../test-utils/fakes/FakePushSender';
import { InMemoryDeviceTokenRepository } from '../test-utils/fakes/InMemoryDeviceTokenRepository';
import { FakeDayCompletion, FakeNotificationPreferences, FakeSendGuard } from '../test-utils/fakes/notificationFakes';
import { SendPushToUser } from '../use-cases/SendPushToUser';
import { StreakSaverAlertJob } from './StreakSaverAlertJob';

// 18:00 UTC == 21:00 Europe/Istanbul, the default STREAK_SAVER_LOCAL_HOUR.
const EVENING_NOW = new Date('2026-09-07T18:00:00.000Z');

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
  completion: FakeDayCompletion,
  prefs = new FakeNotificationPreferences(),
  guard = new FakeSendGuard(),
) {
  const sender = new FakePushSender();
  const job = new StreakSaverAlertJob(
    repository,
    prefs,
    completion,
    new SendPushToUser(repository, sender),
    guard,
    21,
  );
  return { job, sender };
}

describe('StreakSaverAlertJob', () => {
  test('nudges an unfinished day with a live streak, once', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const completion = new FakeDayCompletion();
    completion.set('user-1', { completed: false, currentStreak: 4 });
    const { job, sender } = buildJob(repository, completion);

    const first = await job.execute(EVENING_NOW);
    expect(first.sent).toBe(1);
    expect(sender.sent[0]).toMatchObject({ data: { type: 'streak_saver', currentStreak: '4' } });

    const second = await job.execute(EVENING_NOW);
    expect(second.sent).toBe(0);
  });

  test('does not nudge a completed day', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const completion = new FakeDayCompletion();
    completion.set('user-1', { completed: true, currentStreak: 4 });
    const { job, sender } = buildJob(repository, completion);

    await job.execute(EVENING_NOW);
    expect(sender.sent).toHaveLength(0);
  });

  test('does not nudge when there is no streak to save', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const completion = new FakeDayCompletion();
    completion.set('user-1', { completed: false, currentStreak: 0 });
    const { job, sender } = buildJob(repository, completion);

    await job.execute(EVENING_NOW);
    expect(sender.sent).toHaveLength(0);
  });

  test('honours the streakSaver preference', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const completion = new FakeDayCompletion();
    completion.set('user-1', { completed: false, currentStreak: 4 });
    const prefs = new FakeNotificationPreferences();
    prefs.set('user-1', { streakSaver: false });
    const { job, sender } = buildJob(repository, completion, prefs);

    await job.execute(EVENING_NOW);
    expect(sender.sent).toHaveLength(0);
  });

  test('only fires at the configured local hour', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const completion = new FakeDayCompletion();
    completion.set('user-1', { completed: false, currentStreak: 4 });
    const { job, sender } = buildJob(repository, completion);

    await job.execute(new Date('2026-09-07T15:00:00.000Z')); // 18:00 Istanbul
    expect(sender.sent).toHaveLength(0);
  });
});
