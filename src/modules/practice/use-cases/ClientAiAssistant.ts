import { NotFoundError } from '../../../shared/errors/NotFoundError';
import {
  clientHasAi,
  defaultAiSettings,
  isWithinSchedule,
  type ClientAiAccess,
  type ClientAiSetting,
  type DietitianAiSettings,
} from '../domain/aiAssistant';
import type { AiAssistantRepositoryPort } from '../ports/AiAssistantRepositoryPort';
import type { AiTranscriptMessage, AiTranscriptPort, AiTranscriptSummary } from '../ports/AiTranscriptPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

const TRANSCRIPT_LIST_LIMIT = 50;

export interface ClientAiView {
  access: ClientAiAccess;
  instructions: string | null;
  /** The result of the dietitian's master switch + default + this override. */
  enabled: boolean;
  availableNow: boolean;
}

export type ReviewedTranscriptMessage = AiTranscriptMessage & {
  /** The example the dietitian saved when correcting this reply, if any. */
  correctionExampleId: string | null;
};

/**
 * One client's AI assistant, from the assigned dietitian's side: the per-client
 * on/off override, private instructions, and reviewing what the assistant told
 * the client. Reading the chats needs the client's `ai_chat` consent and is
 * audited like every other client-data read.
 */
export class ClientAiAssistant {
  constructor(
    private readonly aiRepository: AiAssistantRepositoryPort,
    private readonly transcripts: AiTranscriptPort,
    private readonly policy: ClientAccessPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(actorId: string, clientId: string): Promise<ClientAiView> {
    const link = await this.policy.assertAssigned(actorId, clientId);
    const [settings, clientSetting] = await Promise.all([
      this.aiRepository.getSettings(link.dietitianId),
      this.aiRepository.getClientSetting(link.id),
    ]);
    return this.view(settings, clientSetting ?? { linkId: link.id, access: null, instructions: null });
  }

  async update(
    actorId: string,
    clientId: string,
    input: { access: ClientAiAccess; instructions: string | null },
  ): Promise<ClientAiView> {
    const link = await this.policy.assertAssigned(actorId, clientId);
    const instructions = input.instructions?.trim() || null;
    const [saved, settings] = await Promise.all([
      this.aiRepository.saveClientSetting({ linkId: link.id, access: input.access, instructions }),
      this.aiRepository.getSettings(link.dietitianId),
    ]);
    return this.view(settings, saved);
  }

  async listConversations(actorId: string, clientId: string): Promise<AiTranscriptSummary[]> {
    const link = await this.policy.assertCanRead(actorId, clientId, 'ai_chat', 'GET /practice/clients/:id/ai/conversations');
    return this.transcripts.listConversations(clientId, actorId, link.startedAt, TRANSCRIPT_LIST_LIMIT);
  }

  async getConversation(actorId: string, clientId: string, conversationId: string): Promise<ReviewedTranscriptMessage[]> {
    const link = await this.policy.assertCanRead(
      actorId,
      clientId,
      'ai_chat',
      'GET /practice/clients/:id/ai/conversations/:conversationId',
    );
    const [messages, examples] = await Promise.all([
      this.transcripts.getConversation(clientId, conversationId, actorId, link.startedAt),
      this.aiRepository.listExamples(actorId),
    ]);
    if (!messages) {
      throw new NotFoundError('AI_CONVERSATION_NOT_FOUND', 'Conversation not found');
    }
    const corrections = new Map(
      examples.filter((e) => e.sourceMessageId !== null).map((e) => [e.sourceMessageId!, e.id]),
    );
    return messages.map((message) => ({ ...message, correctionExampleId: corrections.get(message.id) ?? null }));
  }

  private view(settings: DietitianAiSettings | null, clientSetting: ClientAiSetting): ClientAiView {
    const effective = settings ?? defaultAiSettings('');
    const enabled = clientHasAi(effective, clientSetting);
    return {
      access: clientSetting.access,
      instructions: clientSetting.instructions,
      enabled,
      availableNow: enabled && isWithinSchedule(effective.schedule, this.now()),
    };
  }
}
