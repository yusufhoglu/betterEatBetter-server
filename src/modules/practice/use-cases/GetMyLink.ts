import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { ClientLink, PersonSummary } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { describeLinkForClient } from './GetPracticeMe';

export class GetMyLink {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
  ) {}

  async execute(clientId: string): Promise<ClientLink & { dietitian: PersonSummary; threadId: string | null }> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw new NotFoundError('NO_ACTIVE_LINK', 'You have no active dietitian');
    }
    return describeLinkForClient(this.repository, this.threads, link);
  }
}
