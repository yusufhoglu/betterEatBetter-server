import type { AssistantTranscripts } from '../../../dietician/use-cases/AssistantTranscripts';
import type { AiTranscriptMessage, AiTranscriptPort, AiTranscriptSummary } from '../../ports/AiTranscriptPort';

/** Reads the AI coach's conversations through the dietician module's public use-case. */
export class DieticianTranscriptAdapter implements AiTranscriptPort {
  constructor(private readonly transcripts: AssistantTranscripts) {}

  async listConversations(
    clientId: string,
    dietitianId: string,
    since: Date,
    limit: number,
  ): Promise<AiTranscriptSummary[]> {
    const rows = await this.transcripts.list(clientId, dietitianId, since, limit);
    return rows.map((row) => ({
      conversationId: row.id,
      title: row.title,
      lastMessageAt: row.lastMessageAt,
      messageCount: row.messageCount,
    }));
  }

  getConversation(
    clientId: string,
    conversationId: string,
    dietitianId: string,
    since: Date,
  ): Promise<AiTranscriptMessage[] | null> {
    return this.transcripts.get(clientId, conversationId, dietitianId, since);
  }

  findAssistantMessage(messageId: string, dietitianId: string): Promise<{ id: string; content: string } | null> {
    return this.transcripts.findAssistantMessage(messageId, dietitianId);
  }
}
