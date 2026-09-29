import { ConflictError } from '../../../shared/errors/ConflictError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { validatePasswordStrength } from '../../identity/domain/validatePasswordStrength';
import { generateInviteKey } from '../../practice/domain/inviteCode';
import { generatePassword } from '../domain/generatePassword';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';

/**
 * How the new account signs in:
 * - generate: a random password, returned once for the admin to hand over;
 * - set:      the admin types the password;
 * - google:   no password — the person signs in with Google using this email
 *             (SignInWithProvider links a verified Google email to the account).
 */
export type PasswordMode = 'generate' | 'set' | 'google';

export interface CreateAccountInput {
  email: string;
  name: string;
  role: 'user' | 'dietitian';
  passwordMode: PasswordMode;
  password?: string;
  premium: boolean;
  dietitianTitle?: string | null;
  licenseNo?: string | null;
}

export interface CreatedAccount {
  userId: string;
  email: string;
  /** Only for passwordMode 'generate' — shown once, never stored in plain text. */
  generatedPassword: string | null;
}

export class ManageAccounts {
  constructor(
    private readonly repository: AdminRepositoryPort,
    private readonly hashPassword: (password: string) => Promise<string>,
    private readonly clock: () => Date = () => new Date(),
    private readonly newPassword: () => string = generatePassword,
  ) {}

  async create(adminId: string, input: CreateAccountInput): Promise<CreatedAccount> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) {
      throw new ValidationError('NAME_REQUIRED', 'A name is required');
    }
    if (await this.repository.emailExists(email)) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'This email is already registered');
    }

    const { passwordHash, generatedPassword } = await this.resolvePassword(input.passwordMode, input.password);
    const { userId } = await this.repository.createUser({
      email,
      name,
      passwordHash,
      premium: input.premium,
      dietitian:
        input.role === 'dietitian'
          ? { title: input.dietitianTitle?.trim() || null, licenseNo: input.licenseNo?.trim() || null, inviteKey: generateInviteKey() }
          : null,
      now: this.clock(),
    });

    await this.repository.appendAudit({
      adminId,
      action: 'user.create',
      targetType: 'user',
      targetId: userId,
      // Never the password itself.
      details: { role: input.role, premium: input.premium, signIn: input.passwordMode },
    });
    return { userId, email, generatedPassword };
  }

  /** New password (generated or typed) or Google-only; every open session is ended. */
  async resetPassword(adminId: string, userId: string, mode: PasswordMode, password?: string): Promise<{ generatedPassword: string | null }> {
    if (!(await this.repository.userExists(userId))) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }
    const { passwordHash, generatedPassword } = await this.resolvePassword(mode, password);
    await this.repository.setPassword(userId, passwordHash, this.clock());
    await this.repository.appendAudit({ adminId, action: 'user.password_reset', targetType: 'user', targetId: userId, details: { signIn: mode } });
    return { generatedPassword };
  }

  private async resolvePassword(mode: PasswordMode, password?: string): Promise<{ passwordHash: string | null; generatedPassword: string | null }> {
    if (mode === 'google') {
      return { passwordHash: null, generatedPassword: null };
    }
    if (mode === 'generate') {
      const generated = this.newPassword();
      return { passwordHash: await this.hashPassword(generated), generatedPassword: generated };
    }
    if (!password || !validatePasswordStrength(password)) {
      throw new ValidationError('PASSWORD_TOO_WEAK', 'Password must be at least 8 characters long');
    }
    return { passwordHash: await this.hashPassword(password), generatedPassword: null };
  }
}
