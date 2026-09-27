import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { ClientLink, ConsentScope } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

/** The client decides, at any time, which scopes their dietitian may read. Takes effect immediately. */
export class UpdateConsent {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(clientId: string, scopes: ConsentScope[]): Promise<ClientLink> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw new NotFoundError('NO_ACTIVE_LINK', 'You have no active dietitian');
    }
    return this.repository.updateConsent(link.id, [...new Set(scopes)], this.now());
  }
}
