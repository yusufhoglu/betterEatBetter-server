import type { OrganizationMembership, PersonSummary } from '../domain/practiceTypes';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { requireMembership } from './requireMembership';

export interface OrganizationMemberView {
  userId: string;
  role: OrganizationMembership['role'];
  joinedAt: Date;
  person: PersonSummary;
  activeClientCount: number;
}

/** Any member may see colleagues (to know who to reassign to); invite keys never leave the server. */
export class ListOrganizationMembers {
  constructor(private readonly repository: PracticeRepositoryPort) {}

  async execute(actorId: string, organizationId: string): Promise<OrganizationMemberView[]> {
    await requireMembership(this.repository, actorId, organizationId);
    const [members, links] = await Promise.all([
      this.repository.listOrganizationMembers(organizationId),
      this.repository.listActiveLinksForOrganization(organizationId),
    ]);

    return members
      .filter((member) => member.status === 'active')
      .map((member) => ({
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt,
        person: member.person,
        activeClientCount: links.filter((link) => link.dietitianId === member.userId).length,
      }));
  }
}
