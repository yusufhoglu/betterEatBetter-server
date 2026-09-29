import type { ConversationDigest } from '../domain/ConversationDigest';
import type { DieticianConversation } from '../domain/DieticianConversation';
import type { DieticianConversationSummary } from '../domain/ConversationSummary';
import type { DieticianMessage, DieticianMessageOrigin, DieticianMessageRole } from '../domain/DieticianMessage';

export interface AssistantConversationSummary {
  id: string;
  title: string | null;
  lastMessageAt: Date;
  messageCount: number;
}

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

  /** `dietitianId`: the turn ran as that dietitian's AI assistant (stamped for their review). */
  appendMessage(
    conversationId: string,
    role: DieticianMessageRole,
    content: string,
    origin?: DieticianMessageOrigin,
    dietitianId?: string | null,
  ): Promise<DieticianMessage>;

  /**
   * The user's conversations that contain messages stamped with `dietitianId`
   * at or after `since`; counts and dates cover only those messages.
   */
  listAssistantConversations(
    userId: string,
    dietitianId: string,
    since: Date,
    limit: number,
  ): Promise<AssistantConversationSummary[]>;

  /** Only the messages stamped with `dietitianId` at/after `since`; null if the conversation is not the user's. */
  findAssistantMessages(
    userId: string,
    conversationId: string,
    dietitianId: string,
    since: Date,
  ): Promise<DieticianMessage[] | null>;

  findMessage(messageId: string): Promise<DieticianMessage | null>;

  /** Persists a rebuilt digest and stamps the turnCount it was built at. */
  saveDigest(conversationId: string, digest: ConversationDigest, atTurn: number): Promise<void>;

  /** Bumps turnCount by one and returns the new value. */
  incrementTurnCount(conversationId: string): Promise<number>;
}
