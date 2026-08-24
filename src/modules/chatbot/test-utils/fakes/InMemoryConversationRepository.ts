import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { Conversation } from '../../domain/Conversation';
import type { Message, MessageRole } from '../../domain/Message';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { ConversationRepositoryPort } from '../../ports/ConversationRepositoryPort';

export class InMemoryConversationRepository implements ConversationRepositoryPort {
  private readonly conversations = new Map<string, Conversation>();

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

    const created: Conversation = { id: conversationId, userId, createdAt: new Date(), messages: [] };
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
      createdAt: new Date(),
    };
    conversation.messages.push(message);
    return { ...message };
  }
}

function cloneConversation(conversation: Conversation): Conversation {
  return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
}
