import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { Conversation } from '../../domain/Conversation';
import type { ConversationSummary } from '../../domain/ConversationSummary';
import { deriveConversationPreview, deriveConversationTitle } from '../../domain/ConversationSummary';
import type { Message, MessageRole } from '../../domain/Message';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { ConversationRepositoryPort } from '../../ports/ConversationRepositoryPort';

export class InMemoryConversationRepository implements ConversationRepositoryPort {
  private readonly conversations = new Map<string, Conversation>();
  /** Monotonic clock so message ordering is deterministic in fast tests. */
  private clock = 0;

  private nextTimestamp(): Date {
    this.clock += 1;
    return new Date(this.clock);
  }

  async findById(userId: string, conversationId: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return cloneConversation(conversation);
  }

  async findOrCreate(userId: string, conversationId: string): Promise<Conversation> {
    const existing = this.conversations.get(conversationId);
    if (existing) {
      if (existing.userId !== userId) {
        throw new NotFoundError('CONVERSATION_NOT_FOUND', 'Conversation was not found');
      }
      return cloneConversation(existing);
    }

    const created: Conversation = { id: conversationId, userId, createdAt: this.nextTimestamp(), messages: [] };
    this.conversations.set(conversationId, created);
    return cloneConversation(created);
  }

  async appendMessage(conversationId: string, role: MessageRole, content: string): Promise<Message> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new NotFoundError('CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }

    const proposal = decodeProposalMessage(content);
    const message: Message = {
      id: randomUUID(),
      conversationId,
      role,
      content: proposal ? '' : content,
      ...(proposal ? { proposal } : {}),
      createdAt: this.nextTimestamp(),
    };
    conversation.messages.push(message);
    return { ...message };
  }

  async listByUser(userId: string, limit: number): Promise<ConversationSummary[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.userId === userId && conversation.messages.length > 0)
      .map((conversation) => {
        const messages = conversation.messages;
        const firstUser = messages.find((message) => message.role === 'user');
        return {
          id: conversation.id,
          createdAt: conversation.createdAt,
          lastMessageAt: messages[messages.length - 1]!.createdAt,
          messageCount: messages.length,
          title: deriveConversationTitle(firstUser?.content),
          preview: deriveConversationPreview(messages[messages.length - 1]!.content),
        };
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit);
  }
}

function cloneConversation(conversation: Conversation): Conversation {
  return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
}
