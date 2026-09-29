import { ConflictError } from '../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { generatePassword } from '../domain/generatePassword';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';
import { ManageAccounts } from './ManageAccounts';

const now = new Date('2026-09-29T10:00:00.000Z');
const hash = async (password: string) => `hash(${password})`;

function repo(overrides: Partial<jest.Mocked<AdminRepositoryPort>> = {}) {
  return {
    emailExists: jest.fn().mockResolvedValue(false),
    createUser: jest.fn().mockResolvedValue({ userId: 'new-user' }),
    userExists: jest.fn().mockResolvedValue(true),
    setPassword: jest.fn().mockResolvedValue(undefined),
    appendAudit: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<AdminRepositoryPort>;
}

const base = { email: '  Zeynep@Example.com ', name: ' Zeynep Demir ', role: 'user' as const, premium: false };

describe('ManageAccounts.create', () => {
  it('creates a user with a generated password it returns once and never audits', async () => {
    const r = repo();
    const accounts = new ManageAccounts(r, hash, () => now, () => 'Abcd-Efgh-Jkmn');

    const result = await accounts.create('admin', { ...base, passwordMode: 'generate' });

    expect(result).toEqual({ userId: 'new-user', email: 'zeynep@example.com', generatedPassword: 'Abcd-Efgh-Jkmn' });
    expect(r.createUser).toHaveBeenCalledWith({
      email: 'zeynep@example.com',
      name: 'Zeynep Demir',
      passwordHash: 'hash(Abcd-Efgh-Jkmn)',
      premium: false,
      dietitian: null,
      now,
    });
    expect(r.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.create', targetId: 'new-user', details: { role: 'user', premium: false, signIn: 'generate' } }),
    );
    expect(JSON.stringify(r.appendAudit.mock.calls)).not.toContain('Abcd');
  });

  it('accepts an admin-chosen password but enforces the sign-up strength rule', async () => {
    const r = repo();
    const accounts = new ManageAccounts(r, hash, () => now);
    await expect(accounts.create('admin', { ...base, passwordMode: 'set', password: 'short' })).rejects.toBeInstanceOf(ValidationError);
    const ok = await accounts.create('admin', { ...base, passwordMode: 'set', password: 'uzun-sifre-1' });
    expect(ok.generatedPassword).toBeNull();
    expect(r.createUser).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: 'hash(uzun-sifre-1)' }));
  });

  it('creates a Google-only account without a password', async () => {
    const r = repo();
    await new ManageAccounts(r, hash, () => now).create('admin', { ...base, passwordMode: 'google' });
    expect(r.createUser).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: null }));
  });

  it('provisions a dietitian practice and premium in the same create', async () => {
    const r = repo();
    await new ManageAccounts(r, hash, () => now).create('admin', {
      ...base,
      role: 'dietitian',
      passwordMode: 'generate',
      premium: true,
      dietitianTitle: ' Dyt. ',
      licenseNo: '',
    });
    const record = r.createUser.mock.calls[0]![0];
    expect(record.premium).toBe(true);
    expect(record.dietitian).toEqual({ title: 'Dyt.', licenseNo: null, inviteKey: expect.any(String) });
  });

  it('rejects an email that already exists (any case)', async () => {
    const r = repo({ emailExists: jest.fn().mockResolvedValue(true) });
    await expect(new ManageAccounts(r, hash).create('admin', { ...base, passwordMode: 'generate' })).rejects.toBeInstanceOf(ConflictError);
    expect(r.emailExists).toHaveBeenCalledWith('zeynep@example.com');
    expect(r.createUser).not.toHaveBeenCalled();
  });
});

describe('ManageAccounts.resetPassword', () => {
  it('sets a new generated password and audits without it', async () => {
    const r = repo();
    const result = await new ManageAccounts(r, hash, () => now, () => 'Wxyz-2345-Abcd').resetPassword('admin', 'u1', 'generate');
    expect(result).toEqual({ generatedPassword: 'Wxyz-2345-Abcd' });
    expect(r.setPassword).toHaveBeenCalledWith('u1', 'hash(Wxyz-2345-Abcd)', now);
    expect(r.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.password_reset', details: { signIn: 'generate' } }));
  });

  it('404s for an unknown user', async () => {
    const r = repo({ userExists: jest.fn().mockResolvedValue(false) });
    await expect(new ManageAccounts(r, hash).resetPassword('admin', 'x', 'generate')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('generatePassword', () => {
  it('is 3 groups of 4 unambiguous characters and differs each time', () => {
    const a = generatePassword();
    expect(a).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}$/);
    expect(generatePassword()).not.toBe(a);
  });
});
