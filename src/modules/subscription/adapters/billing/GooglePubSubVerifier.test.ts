import { OAuth2Client } from 'google-auth-library';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import { GooglePubSubVerifier } from './GooglePubSubVerifier';

describe('GooglePubSubVerifier', () => {
  let verifyIdTokenSpy: jest.Mock;

  beforeEach(() => {
    verifyIdTokenSpy = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken') as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects when the Authorization header is missing', async () => {
    const verifier = new GooglePubSubVerifier('https://example.com/webhook');
    await expect(verifier.verify(undefined)).rejects.toThrow(ValidationError);
    expect(verifyIdTokenSpy).not.toHaveBeenCalled();
  });

  test('rejects when the Authorization header is not a Bearer token', async () => {
    const verifier = new GooglePubSubVerifier('https://example.com/webhook');
    await expect(verifier.verify('Basic abc123')).rejects.toThrow(ValidationError);
    expect(verifyIdTokenSpy).not.toHaveBeenCalled();
  });

  test('resolves when the token verifies against the configured audience', async () => {
    verifyIdTokenSpy.mockResolvedValue({} as never);
    const verifier = new GooglePubSubVerifier('https://example.com/webhook');

    await expect(verifier.verify('Bearer valid-token')).resolves.toBeUndefined();
    expect(verifyIdTokenSpy).toHaveBeenCalledWith({ idToken: 'valid-token', audience: 'https://example.com/webhook' });
  });

  test('rejects when verifyIdToken throws (bad signature, wrong audience, expired, ...)', async () => {
    verifyIdTokenSpy.mockRejectedValue(new Error('Wrong recipient'));
    const verifier = new GooglePubSubVerifier('https://example.com/webhook');

    await expect(verifier.verify('Bearer tampered-token')).rejects.toThrow(ValidationError);
  });
});
