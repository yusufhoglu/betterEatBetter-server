import { ValidationError } from '../../../shared/errors/ValidationError';
import { InMemoryDeviceTokenRepository } from '../test-utils/fakes/InMemoryDeviceTokenRepository';
import { RegisterDeviceToken } from './RegisterDeviceToken';

describe('RegisterDeviceToken', () => {
  const baseInput = {
    userId: 'user-1',
    token: 'fcm-token-abc',
    platform: 'android',
    timezone: 'Europe/Istanbul',
  };

  test('upserts the token with the resolved locale', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    const useCase = new RegisterDeviceToken(repository);

    const { id } = await useCase.execute({ ...baseInput, locale: 'tr' });

    expect(id).toBeDefined();
    expect(repository.rows.get('fcm-token-abc')).toMatchObject({
      userId: 'user-1',
      platform: 'android',
      timezone: 'Europe/Istanbul',
      locale: 'tr',
    });
  });

  test('defaults an unknown locale to en', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    await new RegisterDeviceToken(repository).execute({ ...baseInput, locale: 'de' });

    expect(repository.rows.get('fcm-token-abc')?.locale).toBe('en');
  });

  test('re-registering the same token keeps its id and moves the owner', async () => {
    const repository = new InMemoryDeviceTokenRepository();
    const useCase = new RegisterDeviceToken(repository);

    const first = await useCase.execute(baseInput);
    const second = await useCase.execute({ ...baseInput, userId: 'user-2' });

    expect(second.id).toBe(first.id);
    expect(repository.rows.get('fcm-token-abc')?.userId).toBe('user-2');
  });

  test.each([
    ['bad platform', { ...baseInput, platform: 'windows' }],
    ['unknown time zone', { ...baseInput, timezone: 'Mars/Olympus' }],
    ['empty token', { ...baseInput, token: '   ' }],
  ])('rejects %s', async (_label, input) => {
    const useCase = new RegisterDeviceToken(new InMemoryDeviceTokenRepository());
    await expect(useCase.execute(input)).rejects.toThrow(ValidationError);
  });
});
