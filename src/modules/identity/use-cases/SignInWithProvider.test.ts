import { ValidationError } from '../../../shared/errors/ValidationError';
import type { IdentityProviderPort, SocialIdTokenCredentials, VerifiedIdentity } from '../ports/IdentityProviderPort';
import { FakeSessionTokenPort } from '../test-utils/fakes/FakeSessionTokenPort';
import { InMemoryRefreshTokenRepository } from '../test-utils/fakes/InMemoryRefreshTokenRepository';
import { InMemoryUserRepository } from '../test-utils/fakes/InMemoryUserRepository';
import { SignInWithProvider } from './SignInWithProvider';

class FakeGoogleProvider implements IdentityProviderPort<SocialIdTokenCredentials> {
  verify = jest.fn<Promise<VerifiedIdentity>, [SocialIdTokenCredentials]>();
}

function build(provider: IdentityProviderPort<SocialIdTokenCredentials>) {
  const userRepository = new InMemoryUserRepository();
  const sessionTokenPort = new FakeSessionTokenPort();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const signInWithProvider = new SignInWithProvider(
    { google: provider },
    userRepository,
    sessionTokenPort,
    refreshTokenRepository,
  );
  return { signInWithProvider, userRepository };
}

describe('SignInWithProvider', () => {
  test('creates a new user the first time a Google identity signs in', async () => {
    const provider = new FakeGoogleProvider();
    provider.verify.mockResolvedValue({ externalId: 'google-sub-1', email: 'newcomer@example.com' });
    const { signInWithProvider, userRepository } = build(provider);

    const session = await signInWithProvider.execute({ provider: 'google', idToken: 'token' });

    expect(session.userId).toBeTruthy();
    expect(session.accessToken).toBe(`access-token:${session.userId}`);
    expect(session.refreshToken).toBeTruthy();

    const stored = await userRepository.findByGoogleSub('google-sub-1');
    expect(stored?.id).toBe(session.userId);
    expect(stored?.email).toBe('newcomer@example.com');
    expect(stored?.passwordHash).toBeNull();
  });

  test('returns the same user on a repeat sign-in without creating a duplicate', async () => {
    const provider = new FakeGoogleProvider();
    provider.verify.mockResolvedValue({ externalId: 'google-sub-1', email: 'newcomer@example.com' });
    const { signInWithProvider } = build(provider);

    const first = await signInWithProvider.execute({ provider: 'google', idToken: 'token' });
    const second = await signInWithProvider.execute({ provider: 'google', idToken: 'token' });

    expect(second.userId).toBe(first.userId);
  });

  test('automatically links the Google identity to an existing email+password account', async () => {
    const provider = new FakeGoogleProvider();
    provider.verify.mockResolvedValue({ externalId: 'google-sub-9', email: 'existing@example.com' });
    const { signInWithProvider, userRepository } = build(provider);

    const existing = await userRepository.create({ email: 'existing@example.com', passwordHash: 'argon2-hash' });

    const session = await signInWithProvider.execute({ provider: 'google', idToken: 'token' });

    expect(session.userId).toBe(existing.id);
    const linked = await userRepository.findById(existing.id);
    expect(linked?.googleSub).toBe('google-sub-9');
    expect(linked?.passwordHash).toBe('argon2-hash');
  });

  test('throws ValidationError (UNSUPPORTED_PROVIDER) for a provider that is not configured', async () => {
    const provider = new FakeGoogleProvider();
    const { signInWithProvider } = build(provider);

    await expect(signInWithProvider.execute({ provider: 'apple', idToken: 'token' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(provider.verify).not.toHaveBeenCalled();
  });

  test('propagates the adapter error when token verification fails', async () => {
    const provider = new FakeGoogleProvider();
    provider.verify.mockRejectedValue(new Error('bad token'));
    const { signInWithProvider } = build(provider);

    await expect(signInWithProvider.execute({ provider: 'google', idToken: 'token' })).rejects.toThrow('bad token');
  });
});
