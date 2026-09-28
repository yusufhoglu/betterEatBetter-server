import { ForbiddenError } from '../../../../shared/errors/ForbiddenError';
import type { RefreshTokenRepositoryPort } from '../../ports/RefreshTokenRepositoryPort';
import { SuspensionGuardedRefreshTokens } from './SuspensionGuardedRefreshTokens';

function inner(): jest.Mocked<RefreshTokenRepositoryPort> {
  return {
    issue: jest.fn().mockResolvedValue({ token: 't', expiresAt: new Date() }),
    rotate: jest.fn().mockResolvedValue({ userId: 'u1', refreshToken: { token: 't2', expiresAt: new Date() } }),
    revoke: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SuspensionGuardedRefreshTokens', () => {
  it('issues and rotates normally for active users', async () => {
    const tokens = inner();
    const guarded = new SuspensionGuardedRefreshTokens(tokens, async () => false);

    await expect(guarded.issue('u1')).resolves.toMatchObject({ token: 't' });
    await expect(guarded.rotate('t')).resolves.toMatchObject({ userId: 'u1' });
  });

  it('refuses to start a session for a suspended user', async () => {
    const tokens = inner();
    const guarded = new SuspensionGuardedRefreshTokens(tokens, async () => true);

    await expect(guarded.issue('u1')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('ends a session on refresh once the user is suspended', async () => {
    const tokens = inner();
    const guarded = new SuspensionGuardedRefreshTokens(tokens, async () => true);

    await expect(guarded.rotate('t')).rejects.toBeInstanceOf(ForbiddenError);
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
  });
});
