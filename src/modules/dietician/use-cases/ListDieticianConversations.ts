import type { DieticianConversationSummary } from '../domain/ConversationSummary';
import type { DieticianConversationRepositoryPort } from '../ports/DieticianConversationRepositoryPort';

export const DEFAULT_DIETICIAN_CONVERSATION_LIST_LIMIT = 30;
export const MAX_DIETICIAN_CONVERSATION_LIST_LIMIT = 100;

export class ListDieticianConversations {
  constructor(private readonly repository: DieticianConversationRepositoryPort) {}

  async execute(
    userId: string,
    limit = DEFAULT_DIETICIAN_CONVERSATION_LIST_LIMIT,
  ): Promise<DieticianConversationSummary[]> {
    const capped = Math.max(1, Math.min(limit, MAX_DIETICIAN_CONVERSATION_LIST_LIMIT));
    return this.repository.listByUser(userId, capped);
  }
}
