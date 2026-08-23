import { ConflictError } from '../../../shared/errors/ConflictError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import { FakeSessionTokenPort } from '../test-utils/fakes/FakeSessionTokenPort';
import { InMemoryRefreshTokenRepository } from '../test-utils/fakes/InMemoryRefreshTokenRepository';
import { InMemoryUserRepository } from '../test-utils/fakes/InMemoryUserRepository';
import { SignUp } from './SignUp';

function buildSignUp() {
  const userRepository = new InMemoryUserRepository();
  const emailPasswordAdapter = new EmailPasswordAdapter(userRepository);
  const sessionTokenPort = new FakeSessionTokenPort();
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const signUp = new SignUp(userRepository, emailPasswordAdapter, sessionTokenPort, refreshTokenRepository);
  return { signUp, userRepository };
}

describe('SignUp', () => {
  test('creates a user and returns an access + refresh token (auto sign-in after registration)', async () => {
    const { signUp, userRepository } = buildSignUp();

    const session = await signUp.execute({ email: 'new@example.com', password: 'password123' });

    expect(session.userId).toBeTruthy();
    expect(session.accessToken).toBe(`access-token:${session.userId}`);
    expect(session.refreshToken).toBeTruthy();
    expect(session.refreshTokenExpiresAt).toBeInstanceOf(Date);

    const stored = await userRepository.findByEmail('new@example.com');
    expect(stored?.id).toBe(session.userId);
    expect(stored?.passwordHash).not.toBe('password123');
  });

  test('throws ConflictError with EMAIL_ALREADY_REGISTERED when the email is already taken', async () => {
    const { signUp } = buildSignUp();
    await signUp.execute({ email: 'taken@example.com', password: 'password123' });

    await expect(signUp.execute({ email: 'taken@example.com', password: 'anotherPassword1' })).rejects.toMatchObject(
      {
        code: 'EMAIL_ALREADY_REGISTERED',
      },
    );
  });

  test('throws ConflictError (not a generic Error) on duplicate email', async () => {
    const { signUp } = buildSignUp();
    await signUp.execute({ email: 'taken2@example.com', password: 'password123' });

    await expect(signUp.execute({ email: 'taken2@example.com', password: 'password123' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  test('throws ValidationError with PASSWORD_TOO_WEAK for passwords under 8 characters', async () => {
    const { signUp } = buildSignUp();

    await expect(signUp.execute({ email: 'weak@example.com', password: 'short' })).rejects.toMatchObject({
      code: 'PASSWORD_TOO_WEAK',
    });
  });

  test('rejects a weak password before checking whether the email is already registered', async () => {
    const { signUp, userRepository } = buildSignUp();

    await expect(signUp.execute({ email: 'weak@example.com', password: 'short' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await userRepository.findByEmail('weak@example.com')).toBeNull();
  });
});
