import type { ConversationDigest } from '../domain/ConversationDigest';
import type { DieticianConversation } from '../domain/DieticianConversation';
import type { DieticianConversationSummary } from '../domain/ConversationSummary';
import type { DieticianMessage, DieticianMessageOrigin, DieticianMessageRole } from '../domain/DieticianMessage';

export interface DieticianConversationRepositoryPort {
  /** Conversation with ordered messages if it exists and is owned by userId, else null. */
  findById(userId: string, conversationId: string): Promise<DieticianConversation | null>;

  /**
   * The user's non-empty coaching threads, newest activity first, capped at
   * `limit`. Threads that were materialized but never messaged are omitted.
   */
  listByUser(userId: string, limit: number): Promise<DieticianConversationSummary[]>;

  /** Loads the conversation (must be owned by userId) or creates an empty one under the given id. */
  findOrCreate(userId: string, conversationId: string): Promise<DieticianConversation>;

  appendMessage(
    conversationId: string,
    role: DieticianMessageRole,
    content: string,
    origin?: DieticianMessageOrigin,
  ): Promise<DieticianMessage>;

  /** Persists a rebuilt digest and stamps the turnCount it was built at. */
  saveDigest(conversationId: string, digest: ConversationDigest, atTurn: number): Promise<void>;

  /** Bumps turnCount by one and returns the new value. */
  incrementTurnCount(conversationId: string): Promise<number>;
}
