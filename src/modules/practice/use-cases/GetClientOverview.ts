import type { ClientLink, PersonSummary } from '../domain/practiceTypes';
import type { ClientActivity, ClientDataPort, ClientPlan } from '../ports/ClientDataPort';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';
import { unknownPerson } from './GetPracticeMe';
import { filterActivity } from './ListClients';

export interface ClientOverview {
  link: ClientLink;
  client: PersonSummary;
  dietitian: PersonSummary;
  isAssigned: boolean;
  threadId: string | null;
  /** Assigned dietitian only. */
  plan: ClientPlan | null;
  activity: Partial<Omit<ClientActivity, 'clientId'>> | null;
}

export class GetClientOverview {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly clientData: ClientDataPort,
    private readonly threads: LinkThreadPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async execute(actorId: string, clientId: string, today: Date): Promise<ClientOverview> {
    const { link, isAssigned } = await this.policy.resolveStaffAccess(actorId, clientId);

    const [people, threadId, plan, activity] = await Promise.all([
      this.repository.getPeople([link.clientId, link.dietitianId]),
      isAssigned ? this.threads.findThreadIdForLink(link.id) : Promise.resolve(null),
      isAssigned ? this.clientData.getPlan(clientId) : Promise.resolve(null),
      isAssigned ? this.clientData.getActivity([clientId], today) : Promise.resolve(null),
    ]);
    if (isAssigned) {
      this.policy.log(actorId, clientId, 'summary', 'GET /practice/clients/:clientId');
    }

    return {
      link,
      client: people.get(link.clientId) ?? unknownPerson(link.clientId),
      dietitian: people.get(link.dietitianId) ?? unknownPerson(link.dietitianId),
      isAssigned,
      threadId,
      plan,
      activity: activity ? filterActivity(link, activity.get(clientId)) : null,
    };
  }
}
