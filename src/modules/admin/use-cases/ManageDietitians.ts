import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { AdminRepositoryPort } from '../ports/AdminRepositoryPort';

/** The practice module's cross-organization reassignment, injected as a function. */
export type ReassignClientFn = (clientId: string, newDietitianId: string) => Promise<{ previousDietitianId: string; link: { id: string } }>;

export class ManageDietitians {
  constructor(
    private readonly repository: AdminRepositoryPort,
    private readonly reassignClient: ReassignClientFn,
  ) {}

  /**
   * Suspending pauses every membership: the dietitian drops out of the panel,
   * loses access to client data and cannot accept new invites. Links and
   * history stay intact, so unsuspending restores everything.
   */
  async setSuspended(adminId: string, dietitianId: string, suspended: boolean): Promise<void> {
    if (!(await this.repository.isDietitian(dietitianId))) {
      throw new NotFoundError('DIETITIAN_NOT_FOUND', 'Dietitian not found');
    }
    await this.repository.setDietitianSuspended(dietitianId, suspended);
    await this.repository.appendAudit({
      adminId,
      action: suspended ? 'dietitian.suspend' : 'dietitian.unsuspend',
      targetType: 'dietitian',
      targetId: dietitianId,
    });
  }

  async reassign(adminId: string, clientId: string, newDietitianId: string): Promise<void> {
    const { previousDietitianId, link } = await this.reassignClient(clientId, newDietitianId);
    if (previousDietitianId === newDietitianId) {
      return;
    }
    await this.repository.appendAudit({
      adminId,
      action: 'client.reassign',
      targetType: 'user',
      targetId: clientId,
      details: { linkId: link.id, from: previousDietitianId, to: newDietitianId },
    });
  }
}
