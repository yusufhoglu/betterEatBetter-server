import type { DeviceToken } from '../domain/DeviceToken';
import { FakePushSender } from '../test-utils/fakes/FakePushSender';
import { InMemoryDeviceTokenRepository } from '../test-utils/fakes/InMemoryDeviceTokenRepository';
import { FakeNotificationPreferences, FakeSendGuard } from '../test-utils/fakes/notificationFakes';
import { SendPushToUser } from '../use-cases/SendPushToUser';
import { MealReminderJob } from './MealReminderScheduler';

// 05:30 UTC == 08:30 in Europe/Istanbul (UTC+3) — the default breakfast time.
const BREAKFAST_NOW = new Date('2026-09-07T05:30:00.000Z');

function device(overrides: Partial<DeviceToken> = {}): DeviceToken {
  return {
    id: overrides.id ?? overrides.token ?? 't1',
    userId: 'user-1',
    platform: 'android',
    token: 't1',
    timezone: 'Europe/Istanbul',
    locale: 'en',
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildJob(repository: InMemoryDeviceTokenRepository, prefs: FakeNotificationPreferences, guard: FakeSendGuard) {
  const sender = new FakePushSender();
  const job = new MealReminderJob(repository, prefs, new SendPushToUser(repository, sender), guard);
  return { job, sender };
}

describe('MealReminderJob', () => {
  test('sends one breakfast reminder when local time enters the slot, then dedupes', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const guard = new FakeSendGuard();
    const { job, sender } = buildJob(repository, new FakeNotificationPreferences(), guard);

    const first = await job.execute(BREAKFAST_NOW);
    expect(first.sent).toBe(1);
    expect(sender.sent[0]).toMatchObject({ title: 'Breakfast time', data: { type: 'meal_reminder', meal: 'breakfast' } });

    const second = await job.execute(BREAKFAST_NOW);
    expect(second.sent).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  test('respects the device locale', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device({ locale: 'tr' }));
    const { job, sender } = buildJob(repository, new FakeNotificationPreferences(), new FakeSendGuard());

    await job.execute(BREAKFAST_NOW);
    expect(sender.sent[0]?.title).toBe('Kahvaltı vakti');
  });

  test('skips when master switch is off', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const prefs = new FakeNotificationPreferences();
    prefs.set('user-1', { masterEnabled: false });
    const { job, sender } = buildJob(repository, prefs, new FakeSendGuard());

    await job.execute(BREAKFAST_NOW);
    expect(sender.sent).toHaveLength(0);
  });

  test('skips a disabled meal slot', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const prefs = new FakeNotificationPreferences();
    prefs.set('user-1', { breakfast: { enabled: false, time: '08:30' } });
    const { job, sender } = buildJob(repository, prefs, new FakeSendGuard());

    await job.execute(BREAKFAST_NOW);
    expect(sender.sent).toHaveLength(0);
  });

  test('does not fire outside every slot', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device());
    const { job, sender } = buildJob(repository, new FakeNotificationPreferences(), new FakeSendGuard());

    await job.execute(new Date('2026-09-07T09:00:00.000Z')); // 12:00 Istanbul, before the 12:30 lunch slot
    expect(sender.sent).toHaveLength(0);
  });

  test('fetches each user preference once per run', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device({ id: 'a', token: 'a' }));
    repository.seed(device({ id: 'b', token: 'b' }));
    const prefs = new FakeNotificationPreferences();
    const { job } = buildJob(repository, prefs, new FakeSendGuard());

    await job.execute(BREAKFAST_NOW);
    expect(prefs.calls).toEqual(['user-1']);
  });
});
