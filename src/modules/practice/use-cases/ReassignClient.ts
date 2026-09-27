import { ValidationError } from '../../../shared/errors/ValidationError';
import type { ClientLink } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';
import { requireManager } from './requireMembership';

/**
 * Org owner/admin moves a client to another dietitian of the same clinic.
 * Consent carries over (it was given to the clinic's care); the new
 * dietitian replaces the old one in the chat thread, history intact.
 */
export class ReassignClient {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async execute(actorId: string, clientId: string, newDietitianId: string): Promise<ClientLink> {
    const { link } = await this.policy.resolveStaffAccess(actorId, clientId);
    await requireManager(this.repository, actorId, link.organizationId);

    if (link.dietitianId === newDietitianId) {
      return link;
    }

    const [target, profile] = await Promise.all([
      this.repository.findActiveMembership(link.organizationId, newDietitianId),
      this.repository.findDietitianProfile(newDietitianId),
    ]);
    if (!target || !profile) {
      throw new ValidationError('INVALID_ASSIGNEE', 'The new dietitian must be an active member of the organization');
    }
    if (newDietitianId === link.clientId) {
      throw new ValidationError('INVALID_ASSIGNEE', 'A client cannot be their own dietitian');
    }

    const previousDietitianId = link.dietitianId;
    const updated = await this.repository.reassignLink(link.id, newDietitianId);
    const newName = (await this.repository.getPeople([newDietitianId])).get(newDietitianId)?.name ?? 'yeni diyetisyen';
    await this.threads.replaceParticipant(
      link.id,
      previousDietitianId,
      newDietitianId,
      `Danışan ${newName} adlı diyetisyene devredildi.`,
    );
    return updated;
  }
}
