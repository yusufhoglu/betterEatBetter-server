import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { ClientLink } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

/**
 * Platform admin moves a client to any active dietitian — across
 * organizations, unlike the clinic-scoped ReassignClient. Authorization is the
 * caller's job (admin module). Consent carries over; the chat thread keeps its
 * history and gets a system message so the client sees the change.
 */
export class AdminReassignClient {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
  ) {}

  async execute(clientId: string, newDietitianId: string): Promise<{ link: ClientLink; previousDietitianId: string }> {
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      throw new NotFoundError('LINK_NOT_FOUND', 'The client has no active dietitian');
    }
    if (newDietitianId === clientId) {
      throw new ValidationError('INVALID_ASSIGNEE', 'A client cannot be their own dietitian');
    }
    if (link.dietitianId === newDietitianId) {
      return { link, previousDietitianId: link.dietitianId };
    }

    const [profile, memberships] = await Promise.all([
      this.repository.findDietitianProfile(newDietitianId),
      this.repository.listActiveMemberships(newDietitianId),
    ]);
    const membership = memberships[0];
    if (!profile || !membership) {
      throw new ValidationError('INVALID_ASSIGNEE', 'The new dietitian must be an active dietitian');
    }

    const previousDietitianId = link.dietitianId;
    const moved = await this.repository.moveLink(link.id, newDietitianId, membership.organizationId);
    const newName = (await this.repository.getPeople([newDietitianId])).get(newDietitianId)?.name ?? 'yeni diyetisyen';
    await this.threads.replaceParticipant(link.id, previousDietitianId, newDietitianId, `Danışan ${newName} adlı diyetisyene devredildi.`);
    return { link: moved, previousDietitianId };
  }
}
