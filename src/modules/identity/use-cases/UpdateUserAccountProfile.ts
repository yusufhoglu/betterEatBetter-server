import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { User, UserRepositoryPort } from '../ports/UserRepositoryPort';

export interface UpdateUserAccountProfileInput {
  name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export class UpdateUserAccountProfile {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(userId: string, changes: UpdateUserAccountProfileInput): Promise<User> {
    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      throw new NotFoundError('USER_NOT_FOUND', 'User was not found');
    }

    return this.userRepository.updateProfile({
      id: userId,
      name: changes.name,
      username: changes.username,
      bio: changes.bio,
      avatarUrl: changes.avatarUrl,
    });
  }
}
