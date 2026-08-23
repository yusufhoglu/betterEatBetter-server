import { UnauthorizedError } from '../../../../shared/errors/UnauthorizedError';
import { InMemoryUserRepository } from '../../test-utils/fakes/InMemoryUserRepository';
import { EmailPasswordAdapter } from './EmailPasswordAdapter';

describe('EmailPasswordAdapter', () => {
  test('hashPassword produces a hash that verify() later accepts via a matching user record', async () => {
    const userRepository = new InMemoryUserRepository();
    const adapter = new EmailPasswordAdapter(userRepository);

    const passwordHash = await adapter.hashPassword('correct-horse-battery');
    expect(passwordHash).not.toBe('correct-horse-battery');

    const user = await userRepository.create({ email: 'rider@example.com', passwordHash });

    const identity = await adapter.verify({ email: 'rider@example.com', password: 'correct-horse-battery' });
    expect(identity).toEqual({ externalId: user.id, email: 'rider@example.com' });
  });

  test('verify() throws INVALID_CREDENTIALS when the email is not registered', async () => {
    const userRepository = new InMemoryUserRepository();
    const adapter = new EmailPasswordAdapter(userRepository);

    await expect(adapter.verify({ email: 'nobody@example.com', password: 'whatever1' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  test('verify() throws the exact same INVALID_CREDENTIALS error when the password is wrong', async () => {
    const userRepository = new InMemoryUserRepository();
    const adapter = new EmailPasswordAdapter(userRepository);
    const passwordHash = await adapter.hashPassword('the-real-password');
    await userRepository.create({ email: 'rider@example.com', passwordHash });

    let unknownEmailError: unknown;
    let wrongPasswordError: unknown;

    try {
      await adapter.verify({ email: 'nobody@example.com', password: 'irrelevant' });
    } catch (err) {
      unknownEmailError = err;
    }

    try {
      await adapter.verify({ email: 'rider@example.com', password: 'wrong-password' });
    } catch (err) {
      wrongPasswordError = err;
    }

    expect(unknownEmailError).toBeInstanceOf(UnauthorizedError);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedError);
    expect((unknownEmailError as UnauthorizedError).code).toBe((wrongPasswordError as UnauthorizedError).code);
    expect((unknownEmailError as UnauthorizedError).message).toBe((wrongPasswordError as UnauthorizedError).message);
  });
});
