import { RateLimitError } from '../../../shared/errors/RateLimitError';
import { UnauthorizedError } from '../../../shared/errors/UnauthorizedError';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import type { EmailPasswordCredentials, IdentityProviderPort, VerifiedIdentity } from '../ports/IdentityProviderPort';
import { FakeSessionTokenPort } from '../test-utils/fakes/FakeSessionTokenPort';
import { InMemoryRefreshTokenRepository } from '../test-utils/fakes/InMemoryRefreshTokenRepository';
import { InMemoryUserRepository } from '../test-utils/fakes/InMemoryUserRepository';
import { SignIn } from './SignIn';

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: jest.fn(),
}));

const checkRateLimitMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

class FakeIdentityProvider implements IdentityProviderPort<EmailPasswordCredentials> {
  verify = jest.fn<Promise<VerifiedIdentity>, [EmailPasswordCredentials]>();
}

function buildSignIn(identityProvider: IdentityProviderPort<EmailPasswordCredentials>) {
  const sessionTokenPort = new FakeSessionTokenPort();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  return new SignIn(identityProvider, sessionTokenPort, refreshTokenRepository);
}

describe('SignIn', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(undefined);
  });

  test('checks the rate limit keyed by email before verifying credentials', async () => {
    const identityProvider = new FakeIdentityProvider();
    identityProvider.verify.mockResolvedValue({ externalId: 'user-1', email: 'rider@example.com' });
    const signIn = buildSignIn(identityProvider);

    await signIn.execute({ email: 'rider@example.com', password: 'whatever1' });

    expect(checkRateLimitMock).toHaveBeenCalledWith('signin:rider@example.com', 5, 300);
    const rateLimitCallOrder = checkRateLimitMock.mock.invocationCallOrder[0];
    const verifyCallOrder = identityProvider.verify.mock.invocationCallOrder[0];
    expect(rateLimitCallOrder).toBeLessThan(verifyCallOrder as number);
  });

  test('propagates RateLimitError and never calls the identity provider once the limit is exceeded', async () => {
    const identityProvider = new FakeIdentityProvider();
    checkRateLimitMock.mockRejectedValue(new RateLimitError('RATE_LIMIT_EXCEEDED', 'too many attempts', 300));
    const signIn = buildSignIn(identityProvider);

    await expect(signIn.execute({ email: 'rider@example.com', password: 'whatever1' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(identityProvider.verify).not.toHaveBeenCalled();
  });

  test('returns an access + refresh token pair on successful verification', async () => {
    const identityProvider = new FakeIdentityProvider();
    identityProvider.verify.mockResolvedValue({ externalId: 'user-1', email: 'rider@example.com' });
    const signIn = buildSignIn(identityProvider);

    const session = await signIn.execute({ email: 'rider@example.com', password: 'whatever1' });

    expect(session.userId).toBe('user-1');
    expect(session.accessToken).toBe('access-token:user-1');
    expect(session.refreshToken).toBeTruthy();
  });

  test('unknown email and wrong password produce the exact same INVALID_CREDENTIALS error end-to-end', async () => {
    const userRepository = new InMemoryUserRepository();
    const emailPasswordAdapter = new EmailPasswordAdapter(userRepository);
    const passwordHash = await emailPasswordAdapter.hashPassword('correct-password');
    await userRepository.create({ email: 'rider@example.com', passwordHash });

    const signIn = buildSignIn(emailPasswordAdapter);

    let unknownEmailError: unknown;
    let wrongPasswordError: unknown;

    try {
      await signIn.execute({ email: 'nobody@example.com', password: 'irrelevant' });
    } catch (err) {
      unknownEmailError = err;
    }

    try {
      await signIn.execute({ email: 'rider@example.com', password: 'wrong-password' });
    } catch (err) {
      wrongPasswordError = err;
    }

    expect(unknownEmailError).toBeInstanceOf(UnauthorizedError);
    expect((unknownEmailError as UnauthorizedError).code).toBe('INVALID_CREDENTIALS');
    expect((unknownEmailError as UnauthorizedError).code).toBe((wrongPasswordError as UnauthorizedError).code);
    expect((unknownEmailError as UnauthorizedError).message).toBe((wrongPasswordError as UnauthorizedError).message);
  });
});
