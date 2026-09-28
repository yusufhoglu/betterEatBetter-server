import { generateInviteKey } from '../domain/inviteCode';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { requireMembership } from './requireMembership';

/** Revokes every invite code the dietitian has handed out in this organization. */
export class RotateInviteKey {
  constructor(private readonly repository: PracticeRepositoryPort) {}

  async execute(dietitianId: string, organizationId?: string): Promise<void> {
    const membership = await requireMembership(this.repository, dietitianId, organizationId);
    await this.repository.setInviteKey(membership.organizationId, dietitianId, generateInviteKey());
  }
}
