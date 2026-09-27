import { ConflictError } from '../../../shared/errors/ConflictError';
import type { ClientLink, ConsentScope } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { ManagedClientCachePort } from '../ports/ManagedClientCachePort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { resolveInvite } from './resolveInvite';

export interface JoinDietitianInput {
  clientId: string;
  code: string;
  consentScopes: ConsentScope[];
}

/**
 * Client redeems an invite code: creates the active link with the scopes the
 * client chose and opens the chat thread. A client has at most one active
 * dietitian (also enforced by a partial unique index).
 */
export class JoinDietitian {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
    private readonly managedClientCache: ManagedClientCachePort,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: JoinDietitianInput): Promise<ClientLink & { threadId: string }> {
    const now = this.now();
    const { membership } = await resolveInvite(this.repository, input.code, this.secret, now);

    if (membership.userId === input.clientId) {
      throw new ConflictError('CANNOT_JOIN_SELF', 'You cannot become your own client');
    }
    if (await this.repository.findActiveLinkForClient(input.clientId)) {
      throw new ConflictError('CLIENT_ALREADY_LINKED', 'You already have an active dietitian');
    }

    const link = await this.repository.createLink({
      organizationId: membership.organizationId,
      dietitianId: membership.userId,
      clientId: input.clientId,
      consentScopes: [...new Set(input.consentScopes)],
      now,
    });
    await this.managedClientCache.invalidate(input.clientId);

    const threadId = await this.threads.ensureThreadForLink(link.id, [link.dietitianId, link.clientId]);
    return { ...link, threadId };
  }
}
