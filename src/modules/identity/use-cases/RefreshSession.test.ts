import { UnauthorizedError } from '../../../shared/errors/UnauthorizedError';
import { FakeSessionTokenPort } from '../test-utils/fakes/FakeSessionTokenPort';
import { InMemoryRefreshTokenRepository } from '../test-utils/fakes/InMemoryRefreshTokenRepository';
import { RefreshSession } from './RefreshSession';

function buildRefreshSession() {
  const refreshTokenRepository = new InMemoryRefreshTokenRepository();
  const sessionTokenPort = new FakeSessionTokenPort();
  const refreshSession = new RefreshSession(refreshTokenRepository, sessionTokenPort);
  return { refreshSession, refreshTokenRepository };
}

describe('RefreshSession', () => {
  test('rotation: consumes the presented token and returns a new access + refresh token pair', async () => {
    const { refreshSession, refreshTokenRepository } = buildRefreshSession();
    const initial = await refreshTokenRepository.issue('user-1');

    const session = await refreshSession.execute(initial.token);

    expect(session.userId).toBe('user-1');
    expect(session.accessToken).toBe('access-token:user-1');
    expect(session.refreshToken).not.toBe(initial.token);
    expect(refreshTokenRepository.statusOf(initial.token)).toBe('used');
    expect(refreshTokenRepository.statusOf(session.refreshToken)).toBe('active');
  });

  test('unknown token: throws UnauthorizedError', async () => {
    const { refreshSession } = buildRefreshSession();

    await expect(refreshSession.execute('never-issued-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('reuse detection: presenting an already-rotated token throws and revokes every other active token for that user', async () => {
    const { refreshSession, refreshTokenRepository } = buildRefreshSession();
    const initial = await refreshTokenRepository.issue('user-1');
    const otherActiveToken = await refreshTokenRepository.issue('user-1');

    const firstRotation = await refreshSession.execute(initial.token);
    expect(refreshTokenRepository.statusOf(firstRotation.refreshToken)).toBe('active');

    await expect(refreshSession.execute(initial.token)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSE_DETECTED',
    });

    expect(refreshTokenRepository.statusOf(otherActiveToken.token)).toBe('revoked');
    expect(refreshTokenRepository.statusOf(firstRotation.refreshToken)).toBe('revoked');
  });

  test("reuse detection does not affect a different user's active tokens", async () => {
    const { refreshSession, refreshTokenRepository } = buildRefreshSession();
    const userOneToken = await refreshTokenRepository.issue('user-1');
    const userTwoToken = await refreshTokenRepository.issue('user-2');

    await refreshSession.execute(userOneToken.token);
    await expect(refreshSession.execute(userOneToken.token)).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_REUSE_DETECTED',
    });

    expect(refreshTokenRepository.statusOf(userTwoToken.token)).toBe('active');
  });
});
