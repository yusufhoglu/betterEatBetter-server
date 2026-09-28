import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { hashActivationCode } from '../../practice/domain/activationCode';
import { activationCodeStatus } from '../domain/adminTypes';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';
import { AdminAccessPolicy } from './AdminAccessPolicy';
import { ManageActivationCodes } from './ManageActivationCodes';
import { ManageDietitians } from './ManageDietitians';
import { ManageUsers } from './ManageUsers';

const now = new Date('2026-09-29T10:00:00.000Z');

function repo(overrides: Partial<jest.Mocked<AdminRepositoryPort>> = {}): jest.Mocked<AdminRepositoryPort> {
  return {
    findUserEmail: jest.fn().mockResolvedValue(null),
    userExists: jest.fn().mockResolvedValue(true),
    getOverview: jest.fn(),
    listUsers: jest.fn(),
    getUser: jest.fn(),
    listDietitians: jest.fn(),
    getDietitian: jest.fn(),
    listActivationCodes: jest.fn(),
    listAudit: jest.fn().mockResolvedValue([]),
    suspendUser: jest.fn().mockResolvedValue(undefined),
    unsuspendUser: jest.fn().mockResolvedValue(undefined),
    grantPremium: jest.fn().mockResolvedValue(undefined),
    revokePremium: jest.fn().mockResolvedValue(undefined),
    setDietitianSuspended: jest.fn().mockResolvedValue(1),
    isDietitian: jest.fn().mockResolvedValue(true),
    createActivationCode: jest.fn().mockResolvedValue({ id: 'code-1' }),
    revokeActivationCode: jest.fn().mockResolvedValue(true),
    appendAudit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<AdminRepositoryPort>;
}

describe('AdminAccessPolicy', () => {
  it('matches admin emails case-insensitively', async () => {
    const policy = new AdminAccessPolicy(repo({ findUserEmail: jest.fn().mockResolvedValue('Boss@Example.com') }), [' boss@example.com ']);
    await expect(policy.isAdmin('u1')).resolves.toBe(true);
  });

  it('rejects everyone else, and everyone when the list is empty', async () => {
    const r = repo({ findUserEmail: jest.fn().mockResolvedValue('user@example.com') });
    await expect(new AdminAccessPolicy(r, ['boss@example.com']).assertAdmin('u1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(new AdminAccessPolicy(r, []).isAdmin('u1')).resolves.toBe(false);
    await expect(new AdminAccessPolicy(repo(), ['boss@example.com']).isAdmin('ghost')).resolves.toBe(false);
  });
});

describe('ManageUsers', () => {
  it('suspends with a reason and audits it', async () => {
    const r = repo();
    await new ManageUsers(r, { invalidate: jest.fn() }, () => now).suspend('admin', 'u1', 'spam');
    expect(r.suspendUser).toHaveBeenCalledWith('u1', 'spam', now);
    expect(r.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.suspend', targetId: 'u1', details: { reason: 'spam' } }));
  });

  it('refuses self-suspension and unknown users', async () => {
    const r = repo({ userExists: jest.fn().mockResolvedValue(false) });
    const users = new ManageUsers(r, { invalidate: jest.fn() });
    await expect(users.suspend('admin', 'admin', null)).rejects.toBeInstanceOf(ValidationError);
    await expect(users.suspend('admin', 'ghost', null)).rejects.toBeInstanceOf(NotFoundError);
    expect(r.suspendUser).not.toHaveBeenCalled();
  });

  it('grants and revokes premium and clears the entitlement cache', async () => {
    const r = repo();
    const invalidate = jest.fn().mockResolvedValue(undefined);
    const users = new ManageUsers(r, { invalidate });
    await users.setPremium('admin', 'u1', true);
    await users.setPremium('admin', 'u1', false);
    expect(r.grantPremium).toHaveBeenCalledWith('u1');
    expect(r.revokePremium).toHaveBeenCalledWith('u1');
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(r.appendAudit.mock.calls.map((c) => c[0].action)).toEqual(['premium.grant', 'premium.revoke']);
  });
});

describe('ManageDietitians', () => {
  it('suspends only real dietitians', async () => {
    const r = repo({ isDietitian: jest.fn().mockResolvedValue(false) });
    await expect(new ManageDietitians(r, jest.fn()).setSuspended('admin', 'u1', true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('audits a reassignment with from/to', async () => {
    const r = repo();
    const reassign = jest.fn().mockResolvedValue({ previousDietitianId: 'dyt-a', link: { id: 'link-1' } });
    await new ManageDietitians(r, reassign).reassign('admin', 'client', 'dyt-b');
    expect(reassign).toHaveBeenCalledWith('client', 'dyt-b');
    expect(r.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client.reassign', targetId: 'client', details: { linkId: 'link-1', from: 'dyt-a', to: 'dyt-b' } }),
    );
  });

  it('does not audit a no-op reassignment', async () => {
    const r = repo();
    const reassign = jest.fn().mockResolvedValue({ previousDietitianId: 'dyt-b', link: { id: 'link-1' } });
    await new ManageDietitians(r, reassign).reassign('admin', 'client', 'dyt-b');
    expect(r.appendAudit).not.toHaveBeenCalled();
  });
});

describe('ManageActivationCodes', () => {
  it('stores only the hash and returns the plain code once', async () => {
    const r = repo();
    const codes = new ManageActivationCodes(r, () => now, () => 'ABCD-EFGH-JKMN');
    const result = await codes.create('admin', { maxUses: 3, validityDays: 10, note: '  Ayşe  ' });

    expect(result).toEqual({ id: 'code-1', code: 'ABCD-EFGH-JKMN', expiresAt: new Date('2026-10-09T10:00:00.000Z') });
    expect(r.createActivationCode).toHaveBeenCalledWith({
      codeHash: hashActivationCode('ABCD-EFGH-JKMN'),
      maxUses: 3,
      expiresAt: new Date('2026-10-09T10:00:00.000Z'),
      note: 'Ayşe',
    });
    expect(JSON.stringify(r.appendAudit.mock.calls)).not.toContain('ABCD');
  });

  it('supports never-expiring codes and validates maxUses', async () => {
    const r = repo();
    const codes = new ManageActivationCodes(r, () => now);
    await expect(codes.create('admin', { maxUses: 1, validityDays: null, note: null })).resolves.toMatchObject({ expiresAt: null });
    await expect(codes.create('admin', { maxUses: 0, validityDays: 1, note: null })).rejects.toBeInstanceOf(ValidationError);
  });

  it('404s when revoking an unknown or already revoked code', async () => {
    const r = repo({ revokeActivationCode: jest.fn().mockResolvedValue(false) });
    await expect(new ManageActivationCodes(r).revoke('admin', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('activationCodeStatus', () => {
  const base = { maxUses: 2, usedCount: 0, expiresAt: null, revokedAt: null };
  it('reports revoked > used up > expired > active', () => {
    expect(activationCodeStatus(base, now)).toBe('active');
    expect(activationCodeStatus({ ...base, expiresAt: new Date('2026-09-01') }, now)).toBe('expired');
    expect(activationCodeStatus({ ...base, usedCount: 2, expiresAt: new Date('2026-09-01') }, now)).toBe('used_up');
    expect(activationCodeStatus({ ...base, usedCount: 2, revokedAt: now }, now)).toBe('revoked');
  });
});
