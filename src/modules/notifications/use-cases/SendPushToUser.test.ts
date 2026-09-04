import type { DeviceToken } from '../domain/DeviceToken';
import { FakePushSender } from '../test-utils/fakes/FakePushSender';
import { InMemoryDeviceTokenRepository } from '../test-utils/fakes/InMemoryDeviceTokenRepository';
import { SendPushToUser } from './SendPushToUser';

function device(token: string, overrides: Partial<DeviceToken> = {}): DeviceToken {
  return {
    id: token,
    userId: 'user-1',
    platform: 'android',
    token,
    timezone: 'UTC',
    locale: 'en',
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('SendPushToUser', () => {
  test('sends to every registered device of the user', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device('t1'));
    repository.seed(device('t2', { platform: 'ios' }));
    repository.seed(device('other', { userId: 'user-2' }));
    const sender = new FakePushSender();

    const tally = await new SendPushToUser(repository, sender).execute({
      userId: 'user-1',
      title: 'Hi',
      body: 'There',
    });

    expect(tally).toEqual({ sent: 2, pruned: 0, failed: 0 });
    expect(sender.sent.map((m) => m.token).sort()).toEqual(['t1', 't2']);
  });

  test('prunes tokens the provider reports as invalid', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device('good'));
    repository.seed(device('dead'));
    const sender = new FakePushSender();
    sender.scriptResult('dead', { status: 'invalid_token' });

    const tally = await new SendPushToUser(repository, sender).execute({
      userId: 'user-1',
      title: 'Hi',
      body: 'There',
    });

    expect(tally).toEqual({ sent: 1, pruned: 1, failed: 0 });
    expect(repository.rows.has('dead')).toBe(false);
    expect(repository.rows.has('good')).toBe(true);
  });

  test('counts non-fatal errors without deleting the token', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    repository.seed(device('flaky'));
    const sender = new FakePushSender();
    sender.scriptResult('flaky', { status: 'error', retryable: true, reason: 'FCM_SEND_ERROR' });

    const tally = await new SendPushToUser(repository, sender).execute({
      userId: 'user-1',
      title: 'Hi',
      body: 'There',
    });

    expect(tally).toEqual({ sent: 0, pruned: 0, failed: 1 });
    expect(repository.rows.has('flaky')).toBe(true);
  });
});
