import { ValidationError } from '../../../shared/errors/ValidationError';
import type { PushNotificationVerifierPort } from '../ports/PushNotificationVerifierPort';

// Mock queue.add() — we test that the correct payload was enqueued, without a real Redis.
const queueAddMock = jest.fn().mockResolvedValue({ id: 'job-id' });
jest.mock('../../../shared/queue/queueConnection', () => ({
  createQueue: jest.fn(() => ({ add: queueAddMock })),
  createWorker: jest.fn(),
}));

import { ProcessGooglePlayRtdn } from './ProcessGooglePlayRtdn';

class FakeVerifier implements PushNotificationVerifierPort {
  constructor(private readonly shouldFail = false) {}

  async verify(): Promise<void> {
    if (this.shouldFail) {
      throw new ValidationError('INVALID_PUSH_TOKEN', 'invalid');
    }
  }
}

function encodeNotification(notification: unknown): string {
  return Buffer.from(JSON.stringify(notification)).toString('base64');
}

describe('ProcessGooglePlayRtdn', () => {
  beforeEach(() => {
    queueAddMock.mockClear();
  });

  test('enqueues a reconciliation job for a subscription notification', async () => {
    const useCase = new ProcessGooglePlayRtdn(new FakeVerifier());

    await useCase.execute({
      authorizationHeader: 'Bearer valid',
      rawBody: {
        message: {
          messageId: 'msg-1',
          data: encodeNotification({
            packageName: 'com.example.app',
            subscriptionNotification: {
              purchaseToken: 'token-123',
              subscriptionId: 'yearly',
              notificationType: 4,
            },
          }),
        },
      },
    });

    expect(queueAddMock).toHaveBeenCalledWith(
      'process-play-rtdn',
      expect.objectContaining({ purchaseToken: 'token-123' }),
      { jobId: 'msg-1' },
    );
  });

  test('ignores a notification with no subscriptionNotification (e.g. a test ping)', async () => {
    const useCase = new ProcessGooglePlayRtdn(new FakeVerifier());

    await useCase.execute({
      authorizationHeader: 'Bearer valid',
      rawBody: {
        message: {
          messageId: 'msg-2',
          data: encodeNotification({ packageName: 'com.example.app' }),
        },
      },
    });

    expect(queueAddMock).not.toHaveBeenCalled();
  });

  test('propagates a verification failure without enqueueing anything', async () => {
    const useCase = new ProcessGooglePlayRtdn(new FakeVerifier(true));

    await expect(
      useCase.execute({
        authorizationHeader: 'Bearer invalid',
        rawBody: { message: { messageId: 'msg-3', data: encodeNotification({ packageName: 'x' }) } },
      }),
    ).rejects.toThrow(ValidationError);
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  test('rejects a malformed push envelope', async () => {
    const useCase = new ProcessGooglePlayRtdn(new FakeVerifier());

    await expect(useCase.execute({ authorizationHeader: 'Bearer valid', rawBody: { not: 'an envelope' } })).rejects.toThrow(
      ValidationError,
    );
  });

  test('rejects message.data that is not valid base64 JSON', async () => {
    const useCase = new ProcessGooglePlayRtdn(new FakeVerifier());

    await expect(
      useCase.execute({
        authorizationHeader: 'Bearer valid',
        rawBody: { message: { messageId: 'msg-4', data: 'not-base64-json!!!' } },
      }),
    ).rejects.toThrow(ValidationError);
  });
});
