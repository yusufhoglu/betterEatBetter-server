import type { ClientLink, DietitianProfile, PersonSummary } from '../domain/practiceTypes';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { MembershipWithOrganization, PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAssistantView, ResolveAiAssistant } from './ResolveAiAssistant';

export type ClientLinkView = ClientLink & {
  dietitian: PersonSummary;
  threadId: string | null;
  /** The dietitian's AI assistant, as this client may use it. */
  aiAssistant: ClientAssistantView;
};

export interface PracticeMe {
  /** Null → not a dietitian. */
  dietitian: { profile: DietitianProfile; memberships: MembershipWithOrganization[] } | null;
  /** The caller's own active link as a client, if any. */
  link: ClientLinkView | null;
}

/** One call for the app shell: which modes (client / dietitian) this user has. */
export class GetPracticeMe {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly threads: LinkThreadPort,
    private readonly aiAssistant: ResolveAiAssistant,
  ) {}

  async execute(userId: string): Promise<PracticeMe> {
    const [profile, memberships, link] = await Promise.all([
      this.repository.findDietitianProfile(userId),
      this.repository.listActiveMemberships(userId),
      this.repository.findActiveLinkForClient(userId),
    ]);

    return {
      dietitian: profile && memberships.length > 0 ? { profile, memberships } : null,
      link: link ? await describeLinkForClient(this.repository, this.threads, this.aiAssistant, link) : null,
    };
  }
}

export async function describeLinkForClient(
  repository: PracticeRepositoryPort,
  threads: LinkThreadPort,
  aiAssistant: ResolveAiAssistant,
  link: ClientLink,
): Promise<ClientLinkView> {
  const [people, threadId, assistant] = await Promise.all([
    repository.getPeople([link.dietitianId]),
    threads.findThreadIdForLink(link.id),
    aiAssistant.viewForClient(link.clientId),
  ]);
  return {
    ...link,
    dietitian: people.get(link.dietitianId) ?? unknownPerson(link.dietitianId),
    threadId,
    aiAssistant: assistant,
  };
}

export function unknownPerson(userId: string): PersonSummary {
  return { userId, name: null, username: null, avatarUrl: null };
}
