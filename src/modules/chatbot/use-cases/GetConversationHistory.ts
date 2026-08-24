import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { Conversation } from '../domain/Conversation';
import type { ConversationRepositoryPort } from '../ports/ConversationRepositoryPort';

export class GetConversationHistory {
  constructor(private readonly repository: ConversationRepositoryPort) {}

  async execute(userId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.repository.findById(userId, conversationId);
    if (!conversation) {
      throw new NotFoundError('CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }

    return conversation;
  }
}
