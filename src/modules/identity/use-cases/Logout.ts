import type { RefreshTokenRepositoryPort } from '../ports/RefreshTokenRepositoryPort';

export class Logout {
  constructor(private readonly refreshTokenRepository: RefreshTokenRepositoryPort) {}

  async execute(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.revoke(refreshToken);
  }
}
