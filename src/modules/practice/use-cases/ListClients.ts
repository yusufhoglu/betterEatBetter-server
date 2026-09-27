import type { ClientLink, PersonSummary } from '../domain/practiceTypes';
import type { ClientActivity, ClientDataPort } from '../ports/ClientDataPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import { unknownPerson } from './GetPracticeMe';
import { requireManager } from './requireMembership';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

export interface ListClientsInput {
  actorId: string;
  /** 'mine' → clients assigned to the caller; 'organization' → the whole clinic roster (owner/admin). */
  view: 'mine' | 'organization';
  organizationId?: string;
  query?: string;
  today: Date;
}

export interface ClientListItem {
  linkId: string;
  organizationId: string;
  client: PersonSummary;
  dietitian: PersonSummary;
  consentScopes: ClientLink['consentScopes'];
  startedAt: Date;
  /** Only for the assigned dietitian and only for shared scopes; null otherwise. */
  activity: Partial<Omit<ClientActivity, 'clientId'>> | null;
}

/**
 * Dashboard roster. Activity (last log, 7-day adherence, latest weight) is
 * derived from client data, so it is filtered by consent and shown only to
 * the assigned dietitian — an org admin sees who, not what.
 */
export class ListClients {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly clientData: ClientDataPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async execute(input: ListClientsInput): Promise<ClientListItem[]> {
    let links: ClientLink[];
    if (input.view === 'organization') {
      if (!input.organizationId) {
        return [];
      }
      await requireManager(this.repository, input.actorId, input.organizationId);
      links = await this.repository.listActiveLinksForOrganization(input.organizationId);
    } else {
      links = await this.repository.listActiveLinksForDietitian(input.actorId, input.organizationId);
    }

    const people = await this.repository.getPeople([
      ...new Set(links.flatMap((link) => [link.clientId, link.dietitianId])),
    ]);

    const query = input.query?.trim() ? foldForSearch(input.query.trim()) : '';
    if (query) {
      links = links.filter((link) => {
        const person = people.get(link.clientId);
        return [person?.name, person?.username].some((v) => v && foldForSearch(v).includes(query));
      });
    }

    const assigned = links.filter((link) => link.dietitianId === input.actorId);
    const activity = assigned.length
      ? await this.clientData.getActivity(
          assigned.map((link) => link.clientId),
          input.today,
        )
      : new Map<string, ClientActivity>();

    for (const link of assigned) {
      this.policy.log(input.actorId, link.clientId, 'summary', 'GET /practice/clients');
    }

    return links.map((link) => ({
      linkId: link.id,
      organizationId: link.organizationId,
      client: people.get(link.clientId) ?? unknownPerson(link.clientId),
      dietitian: people.get(link.dietitianId) ?? unknownPerson(link.dietitianId),
      consentScopes: link.consentScopes,
      startedAt: link.startedAt,
      activity: link.dietitianId === input.actorId ? filterActivity(link, activity.get(link.clientId)) : null,
    }));
  }
}

export function filterActivity(
  link: ClientLink,
  activity: ClientActivity | undefined,
): Partial<Omit<ClientActivity, 'clientId'>> {
  const result: Partial<Omit<ClientActivity, 'clientId'>> = {};
  if (link.consentScopes.includes('meals')) {
    result.lastLoggedDate = activity?.lastLoggedDate ?? null;
    result.daysLoggedLast7 = activity?.daysLoggedLast7 ?? 0;
  }
  if (link.consentScopes.includes('body_measurements')) {
    result.latestWeightKg = activity?.latestWeightKg ?? null;
  }
  return result;
}

/** Case-insensitive in Turkish and English alike: "IŞIK", "ışık" and "isik" all match. */
function foldForSearch(value: string): string {
  return value.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\u0307/g, '');
}
