import type { User, UserRepositoryPort } from '../ports/UserRepositoryPort';

export class GetUserAccountProfile {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }
}
