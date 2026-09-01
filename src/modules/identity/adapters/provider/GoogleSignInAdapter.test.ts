import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from '../../../../shared/errors/UnauthorizedError';
import { GoogleSignInAdapter } from './GoogleSignInAdapter';

const AUDIENCES = ['ios.apps.googleusercontent.com', 'android.apps.googleusercontent.com'];

describe('GoogleSignInAdapter', () => {
  let verifyIdTokenSpy: jest.Mock;

  beforeEach(() => {
    verifyIdTokenSpy = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken') as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildAdapter() {
    return new GoogleSignInAdapter(new OAuth2Client(), AUDIENCES);
  }

  test('returns the Google subject and email for a valid, verified token', async () => {
    verifyIdTokenSpy.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-123', email: 'rider@example.com', email_verified: true }),
    } as never);

    const identity = await buildAdapter().verify({ idToken: 'valid-token' });

    expect(identity).toEqual({ externalId: 'google-sub-123', email: 'rider@example.com' });
    expect(verifyIdTokenSpy).toHaveBeenCalledWith({ idToken: 'valid-token', audience: AUDIENCES });
  });

  test('throws GOOGLE_TOKEN_INVALID when verifyIdToken rejects (bad signature / wrong audience / expired)', async () => {
    verifyIdTokenSpy.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));

    await expect(buildAdapter().verify({ idToken: 'tampered' })).rejects.toMatchObject({
      code: 'GOOGLE_TOKEN_INVALID',
    });
  });

  test('throws GOOGLE_TOKEN_INVALID when the email is not verified', async () => {
    verifyIdTokenSpy.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-123', email: 'rider@example.com', email_verified: false }),
    } as never);

    await expect(buildAdapter().verify({ idToken: 'unverified-email' })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('throws GOOGLE_TOKEN_INVALID when the payload has no email', async () => {
    verifyIdTokenSpy.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-123', email_verified: true }),
    } as never);

    await expect(buildAdapter().verify({ idToken: 'no-email' })).rejects.toMatchObject({
      code: 'GOOGLE_TOKEN_INVALID',
    });
  });
});
