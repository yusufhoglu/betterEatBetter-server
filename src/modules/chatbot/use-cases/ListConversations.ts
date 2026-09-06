import type { ConversationSummary } from '../domain/ConversationSummary';
import type { ConversationRepositoryPort } from '../ports/ConversationRepositoryPort';

export const DEFAULT_CONVERSATION_LIST_LIMIT = 30;
export const MAX_CONVERSATION_LIST_LIMIT = 100;

export class ListConversations {
  constructor(private readonly repository: ConversationRepositoryPort) {}

  async execute(userId: string, limit = DEFAULT_CONVERSATION_LIST_LIMIT): Promise<ConversationSummary[]> {
    const capped = Math.max(1, Math.min(limit, MAX_CONVERSATION_LIST_LIMIT));
    return this.repository.listByUser(userId, capped);
  }
}
