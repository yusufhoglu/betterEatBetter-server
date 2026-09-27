import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { ClientLink } from '../domain/practiceTypes';
import type { ClientDataPort } from '../ports/ClientDataPort';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { ManagedClientCachePort } from '../ports/ManagedClientCachePort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

/**
 * Ends a dietitian-client relationship — either side may do it (the client,
 * the assigned dietitian, or an org owner/admin). The plan goes back to the
 * client (targets kept), the chat becomes read-only (history kept) and the
 * client regains the AI coach.
 */
export class EndLink {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly policy: ClientAccessPolicy,
    private readonly clientData: ClientDataPort,
    private readonly threads: LinkThreadPort,
    private readonly managedClientCache: ManagedClientCachePort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async byClient(clientId: string): Promise<ClientLink> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw new NotFoundError('NO_ACTIVE_LINK', 'You have no active dietitian');
    }
    return this.end(link, clientId, 'Danışan bağlantıyı sonlandırdı.');
  }

  async byStaff(actorId: string, clientId: string): Promise<ClientLink> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    return this.end(link, actorId, 'Diyetisyen bağlantıyı sonlandırdı.');
  }

  private async end(link: ClientLink, endedBy: string, systemMessage: string): Promise<ClientLink> {
    const ended = await this.repository.endLink(link.id, endedBy, this.now());
    await this.managedClientCache.invalidate(link.clientId);
    await Promise.all([
      this.clientData.releasePlan(link.clientId),
      this.threads.closeThreadForLink(link.id, systemMessage),
    ]);
    return ended;
  }
}
