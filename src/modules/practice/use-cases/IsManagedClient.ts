import type { ManagedClientCachePort } from '../ports/ManagedClientCachePort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

/**
 * Public entry point for other modules (the AI coach guard): does this user
 * currently have an active dietitian? Cached; practice invalidates on change.
 */
export class IsManagedClient {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly cache: ManagedClientCachePort,
  ) {}

  async execute(userId: string): Promise<boolean> {
    const cached = await this.cache.get(userId);
    if (cached !== null) {
      return cached;
    }
    const managed = (await this.repository.findActiveLinkForClient(userId)) !== null;
    await this.cache.set(userId, managed);
    return managed;
  }
}
