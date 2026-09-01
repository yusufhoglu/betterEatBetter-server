import argon2 from 'argon2';
import { UnauthorizedError } from '../../../../shared/errors/UnauthorizedError';
import type { UserRepositoryPort } from '../../ports/UserRepositoryPort';
import type {
  EmailPasswordCredentials,
  IdentityProviderPort,
  VerifiedIdentity,
} from '../../ports/IdentityProviderPort';

/**
 * `verify` has a single throw path for "email not found" and "wrong password"
 * on purpose — collapsing both branches into one error makes the enumeration
 * protection required by identity-rule.md structural, not something SignIn
 * has to remember to enforce.
 */
export class EmailPasswordAdapter implements IdentityProviderPort<EmailPasswordCredentials> {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(credentials: EmailPasswordCredentials): Promise<VerifiedIdentity> {
    const user = await this.userRepository.findByEmail(credentials.email);
    // A user with no passwordHash signed up through a social provider only —
    // collapsed into the same error so it stays indistinguishable from "wrong
    // password" / "no such email" (identity-rule.md enumeration balance).
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'email veya şifre hatalı');
    }

    const passwordMatches = await argon2.verify(user.passwordHash, credentials.password);
    if (!passwordMatches) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'email veya şifre hatalı');
    }

    return { externalId: user.id, email: user.email };
  }
}
