import {
  assistantDisplayName,
  buildAssistantPersona,
  clientHasAi,
  defaultAiSettings,
  isWithinSchedule,
  nextScheduleOpening,
  type AssistantPersona,
  type ClientAiSetting,
  type DietitianAiSettings,
} from '../domain/aiAssistant';
import type { ClientLink } from '../domain/practiceTypes';
import type { AiAssistantRepositoryPort } from '../ports/AiAssistantRepositoryPort';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { IsManagedClient } from './IsManagedClient';

export type ClientAssistantStatus =
  /** No active dietitian — the user has the regular AI coach. */
  | { kind: 'none' }
  /** Has a dietitian who has not opened their AI assistant to this client. */
  | { kind: 'disabled'; link: ClientLink }
  | {
      kind: 'assistant';
      link: ClientLink;
      settings: DietitianAiSettings;
      clientSetting: ClientAiSetting | null;
      dietitianName: string | null;
      name: string;
      availableNow: boolean;
      /** Null while open, or when the schedule never opens. */
      nextAvailableAt: Date | null;
    };

export type AssistantTurn =
  | { kind: 'none' }
  | { kind: 'unavailable'; reason: 'disabled' | 'off_hours' }
  | { kind: 'assistant'; persona: AssistantPersona };

/** What the client app shows about the assistant (`GET /practice/me/link`). */
export interface ClientAssistantView {
  enabled: boolean;
  availableNow: boolean;
  name: string | null;
  nextAvailableAt: Date | null;
}

/**
 * Public entry point for the AI coach (`dietician` module) and the client's
 * link view: may this client talk to AI right now, and as whom?
 *
 * Users without a dietitian pay one cached lookup (`IsManagedClient`); only
 * managed clients read the settings.
 */
export class ResolveAiAssistant {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly aiRepository: AiAssistantRepositoryPort,
    private readonly isManagedClient: IsManagedClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async status(clientId: string): Promise<ClientAssistantStatus> {
    if (!(await this.isManagedClient.execute(clientId))) {
      return { kind: 'none' };
    }
    const link = await this.repository.findActiveLinkForClient(clientId);
    if (!link) {
      return { kind: 'none' };
    }

    const [settings, clientSetting, membership, people] = await Promise.all([
      this.aiRepository.getSettings(link.dietitianId),
      this.aiRepository.getClientSetting(link.id),
      this.repository.findActiveMembership(link.organizationId, link.dietitianId),
      this.repository.getPeople([link.dietitianId]),
    ]);
    const effective = settings ?? defaultAiSettings(link.dietitianId);

    // A suspended/removed dietitian's assistant stops answering with them.
    if (!membership || !clientHasAi(effective, clientSetting)) {
      return { kind: 'disabled', link };
    }

    const now = this.now();
    const availableNow = isWithinSchedule(effective.schedule, now);
    const dietitianName = people.get(link.dietitianId)?.name ?? null;
    return {
      kind: 'assistant',
      link,
      settings: effective,
      clientSetting,
      dietitianName,
      name: assistantDisplayName(effective, dietitianName),
      availableNow,
      nextAvailableAt: availableNow ? null : nextScheduleOpening(effective.schedule, now),
    };
  }

  /** The persona for one client message, with the dietitian's examples ranked against it. */
  async forTurn(clientId: string, message: string): Promise<AssistantTurn> {
    const status = await this.status(clientId);
    if (status.kind === 'none') {
      return status;
    }
    if (status.kind === 'disabled') {
      return { kind: 'unavailable', reason: 'disabled' };
    }
    if (!status.availableNow) {
      return { kind: 'unavailable', reason: 'off_hours' };
    }
    const examples = await this.aiRepository.listExamples(status.link.dietitianId);
    return {
      kind: 'assistant',
      persona: buildAssistantPersona({
        settings: status.settings,
        dietitianName: status.dietitianName,
        examples,
        message,
        clientInstructions: status.clientSetting?.instructions ?? null,
      }),
    };
  }

  async viewForClient(clientId: string): Promise<ClientAssistantView> {
    const status = await this.status(clientId);
    if (status.kind !== 'assistant') {
      return { enabled: false, availableNow: false, name: null, nextAvailableAt: null };
    }
    return {
      enabled: true,
      availableNow: status.availableNow,
      name: status.name,
      nextAvailableAt: status.nextAvailableAt,
    };
  }
}
