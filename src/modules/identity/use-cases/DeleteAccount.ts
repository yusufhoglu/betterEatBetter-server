import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';
import type { UserRepositoryPort } from '../ports/UserRepositoryPort';

export class DeleteAccount {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly refreshTokenRepository: RefreshTokenRepositoryPort,
  ) {}

  async execute(userId: string): Promise<void> {
    // Revoke sessions first so no refresh rotation can race with the deletion.
    await this.refreshTokenRepository.revokeAllForUser(userId);
    await this.userRepository.deleteById(userId);
  }
}
