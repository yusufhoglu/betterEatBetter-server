import jwt from 'jsonwebtoken';
import { env } from '../../../../shared/config/env';
import { JwtSessionTokenAdapter } from './JwtSessionTokenAdapter';

/**
 * No container needed — this exercises the real `jsonwebtoken` library
 * (no mocks) against JwtSessionTokenAdapter's actual sign/verify behavior,
 * which is what makes it worth keeping alongside the other integration
 * tests rather than as a plain unit test (identity-rule.md).
 */
describe('JwtSessionTokenAdapter (integration)', () => {
  const adapter = new JwtSessionTokenAdapter();

  it('verifies a token it just signed and recovers the original userId', () => {
    const token = adapter.signAccessToken('user-123');

    const payload = adapter.verifyAccessToken(token);

    expect(payload.userId).toBe('user-123');
  });

  it('rejects a token signed with a different secret', () => {
    const foreignToken = jwt.sign({ sub: 'user-123' }, 'a-completely-different-secret-value-32chars', {
      expiresIn: 900,
    });

    expect(() => adapter.verifyAccessToken(foreignToken)).toThrow();
    try {
      adapter.verifyAccessToken(foreignToken);
    } catch (err) {
      expect((err as { code: string }).code).toBe('ACCESS_TOKEN_INVALID');
    }
  });

  it('rejects an expired token', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-123' },
      env.JWT_SECRET,
      { expiresIn: -10 }, // already expired 10 seconds ago
    );

    expect(() => adapter.verifyAccessToken(expiredToken)).toThrow();
    try {
      adapter.verifyAccessToken(expiredToken);
    } catch (err) {
      expect((err as { code: string }).code).toBe('ACCESS_TOKEN_INVALID');
    }
  });

  it('rejects a malformed token string', () => {
    expect(() => adapter.verifyAccessToken('not-a-real-jwt')).toThrow();
  });
});
