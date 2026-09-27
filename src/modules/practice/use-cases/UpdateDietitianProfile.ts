import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { DietitianProfile } from '../domain/practiceTypes';
import type { PracticeRepositoryPort, UpdateDietitianProfileInput } from '../ports/PracticeRepositoryPort';

export class UpdateDietitianProfile {
  constructor(private readonly repository: PracticeRepositoryPort) {}

  async execute(userId: string, patch: UpdateDietitianProfileInput): Promise<DietitianProfile> {
    const existing = await this.repository.findDietitianProfile(userId);
    if (!existing) {
      throw new NotFoundError('NOT_A_DIETITIAN', 'This account is not a dietitian');
    }
    return this.repository.updateDietitianProfile(userId, patch);
  }
}
