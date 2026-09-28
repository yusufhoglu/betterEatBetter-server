import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { UserFilter } from '../domain/adminTypes';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';

const OVERVIEW_WINDOW_DAYS = 30;

/** Read side of the admin panel — thin, so controllers never touch the repository. */
export class AdminQueries {
  constructor(
    private readonly repository: AdminRepositoryPort,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  overview() {
    return this.repository.getOverview(this.clock(), OVERVIEW_WINDOW_DAYS);
  }

  listUsers(input: { q?: string; filter: UserFilter; offset: number; limit: number }) {
    return this.repository.listUsers({ ...input, q: input.q?.trim() || undefined }, this.clock());
  }

  async getUser(userId: string) {
    const user = await this.repository.getUser(userId, this.clock());
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User not found');
    }
    return { user, audit: await this.repository.listAudit(20, userId) };
  }

  listDietitians(q?: string) {
    return this.repository.listDietitians(q?.trim() || undefined);
  }

  async getDietitian(userId: string) {
    const dietitian = await this.repository.getDietitian(userId);
    if (!dietitian) {
      throw new NotFoundError('DIETITIAN_NOT_FOUND', 'Dietitian not found');
    }
    return { dietitian, audit: await this.repository.listAudit(20, userId) };
  }

  listActivationCodes() {
    return this.repository.listActivationCodes(this.clock());
  }

  listAudit(limit: number) {
    return this.repository.listAudit(limit);
  }
}
