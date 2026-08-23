import { ConflictError } from '../../../shared/errors/ConflictError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import { validatePasswordStrength } from '../domain/validatePasswordStrength';
import type { UserSession } from '../domain/UserSession';
import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';
import type { SessionTokenPort } from '../ports/SessionTokenPort';
import type { UserRepositoryPort } from '../ports/UserRepositoryPort';

export interface SignUpInput {
  email: string;
  password: string;
}

/**
 * Creates a new email+password user and logs them in immediately. Deliberately
 * separate from SignIn — no "upsert" (find-or-create) path exists, since that
 * would make the email/password check ambiguous (identity-rule.md).
 */
export class SignUp {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly emailPasswordAdapter: EmailPasswordAdapter,
    private readonly sessionTokenPort: SessionTokenPort,
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
  ) {}

  async execute(input: SignUpInput): Promise<UserSession> {
    if (!validatePasswordStrength(input.password)) {
      throw new ValidationError('PASSWORD_TOO_WEAK', 'Password must be at least 8 characters long');
    }

    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'This email is already registered');
    }

    const passwordHash = await this.emailPasswordAdapter.hashPassword(input.password);
    const user = await this.userRepository.create({ email: input.email, passwordHash });

    const accessToken = this.sessionTokenPort.signAccessToken(user.id);
    const refreshToken = await this.refreshTokenRepository.issue(user.id);

    return {
      userId: user.id,
      accessToken,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
