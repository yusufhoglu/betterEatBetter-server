import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { describeLinkForClient, type ClientLinkView } from './GetPracticeMe';
import type { ResolveAiAssistant } from './ResolveAiAssistant';

export class GetMyLink {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
    private readonly aiAssistant: ResolveAiAssistant,
  ) {}

  async execute(clientId: string): Promise<ClientLinkView> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw new NotFoundError('NO_ACTIVE_LINK', 'You have no active dietitian');
    }
    return describeLinkForClient(this.repository, this.threads, this.aiAssistant, link);
  }
}
