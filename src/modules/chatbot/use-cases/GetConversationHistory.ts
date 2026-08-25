import type { Conversation } from '../domain/Conversation';
import type { ConversationRepositoryPort } from '../ports/ConversationRepositoryPort';

export class GetConversationHistory {
  constructor(private readonly repository: ConversationRepositoryPort) {}

  async execute(userId: string, conversationId: string): Promise<Conversation> {
    return this.repository.findOrCreate(userId, conversationId);
  }
}
