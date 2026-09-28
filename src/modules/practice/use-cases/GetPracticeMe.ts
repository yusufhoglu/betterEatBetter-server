import type { ClientLink, DietitianProfile, PersonSummary } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { MembershipWithOrganization, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';

export interface PracticeMe {
  /** Null → not a dietitian. */
  dietitian: { profile: DietitianProfile; memberships: MembershipWithOrganization[] } | null;
  /** The caller's own active link as a client, if any. */
  link: (ClientLink & { dietitian: PersonSummary; threadId: string | null }) | null;
}

/** One call for the app shell: which modes (client / dietitian) this user has. */
export class GetPracticeMe {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
  ) {}

  async execute(userId: string): Promise<PracticeMe> {
    const [profile, memberships, link] = await Promise.all([
      this.repository.findDietitianProfile(userId),
      this.repository.listActiveMemberships(userId),
      this.repository.findActiveLinkForClient(userId),
    ]);

    return {
      dietitian: profile && memberships.length > 0 ? { profile, memberships } : null,
      link: link ? await describeLinkForClient(this.repository, this.threads, link) : null,
    };
  }
}

export async function describeLinkForClient(
  repository: PracticeRepositoryPort,
  threads: LinkThreadPort,
  link: ClientLink,
): Promise<ClientLink & { dietitian: PersonSummary; threadId: string | null }> {
  const [people, threadId] = await Promise.all([
    repository.getPeople([link.dietitianId]),
    threads.findThreadIdForLink(link.id),
  ]);
  return {
    ...link,
    dietitian: people.get(link.dietitianId) ?? unknownPerson(link.dietitianId),
    threadId,
  };
}

export function unknownPerson(userId: string): PersonSummary {
  return { userId, name: null, username: null, avatarUrl: null };
}
