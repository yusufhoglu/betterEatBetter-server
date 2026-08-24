import type { Conversation } from '../domain/Conversation';
import type { Message, MessageRole } from '../domain/Message';

export interface ConversationRepositoryPort {
  /** Returns the conversation (with ordered messages) if it exists and is owned by userId, else null. */
  findById(userId: string, conversationId: string): Promise<Conversation | null>;

  /**
   * Loads the conversation if it exists (must be owned by userId), otherwise
   * creates a new, empty one under the given id — conversationId is
   * client/trace-supplied and stays fixed for the whole chat, so the first
   * message of a chat implicitly creates its conversation row.
   */
  findOrCreate(userId: string, conversationId: string): Promise<Conversation>;

  appendMessage(conversationId: string, role: MessageRole, content: string): Promise<Message>;
}
