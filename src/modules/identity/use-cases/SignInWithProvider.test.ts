import { SignInWithProvider } from './SignInWithProvider';

/**
 * identity-rule.md scopes this turn to the email+password provider only —
 * Apple/Google adapters (and therefore SignInWithProvider's real behavior)
 * are explicitly out of scope ("bu turda YAZILMAZ"). There is no fake-port
 * scenario to test yet since the use-case itself is an intentional stub; this
 * documents that current state instead of leaving a bare `test.todo`.
 */
describe('SignInWithProvider', () => {
  test('is not yet implemented — Apple/Google providers are out of scope for this turn', async () => {
    const signInWithProvider = new SignInWithProvider();

    await expect(signInWithProvider.execute()).rejects.toThrow('Not implemented: SignInWithProvider');
  });
});
