import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import { FcmPushAdapter } from './FcmPushAdapter';
import type { PushMessage } from '../../ports/PushSenderPort';

jest.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getAccessToken(): Promise<string> {
      return 'fake-access-token';
    }
    async getProjectId(): Promise<string> {
      return 'test-project';
    }
  },
}));

const SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'svc@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
});

const MESSAGE: PushMessage = { token: 'device-1', platform: 'android', title: 'Hi', body: 'There' };

function buildAdapter(): FcmPushAdapter {
  // No retries so a single scripted fetch response is enough to assert mapping.
  return new FcmPushAdapter(SERVICE_ACCOUNT, undefined, buildResiliencePolicy({ timeoutMs: 5_000, retryAttempts: 1 }));
}

function mockFetch(status: number, body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('FcmPushAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  test('maps a 200 to sent', async () => {
    mockFetch(200, { name: 'projects/test-project/messages/1' });
    await expect(buildAdapter().send(MESSAGE)).resolves.toEqual({ status: 'sent' });
  });

  test('targets the app’s Android channel with high priority and sound', async () => {
    mockFetch(200, { name: 'projects/test-project/messages/1' });
    await buildAdapter().send({ ...MESSAGE, data: { type: 'chat_message' } });
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    expect(sent.message).toMatchObject({
      token: 'device-1',
      notification: { title: 'Hi', body: 'There' },
      data: { type: 'chat_message' },
      android: { priority: 'high', notification: { channel_id: 'foodtracker_default', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  });

  test('maps an UNREGISTERED error to invalid_token', async () => {
    mockFetch(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } });
    await expect(buildAdapter().send(MESSAGE)).resolves.toEqual({ status: 'invalid_token' });
  });

  test('maps a 400 to invalid_token', async () => {
    mockFetch(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad token' } });
    await expect(buildAdapter().send(MESSAGE)).resolves.toEqual({ status: 'invalid_token' });
  });

  test('maps a 503 to a retryable error', async () => {
    mockFetch(503, { error: { status: 'UNAVAILABLE' } });
    await expect(buildAdapter().send(MESSAGE)).resolves.toMatchObject({ status: 'error', retryable: true });
  });

  test('maps a 401 to a non-retryable error', async () => {
    mockFetch(401, { error: { status: 'UNAUTHENTICATED' } });
    await expect(buildAdapter().send(MESSAGE)).resolves.toMatchObject({ status: 'error', retryable: false });
  });
});
