import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { ConversationDigest } from '../../domain/ConversationDigest';
import type { DieticianConversation } from '../../domain/DieticianConversation';
import type {
  DieticianMessage,
  DieticianMessageOrigin,
  DieticianMessageRole,
} from '../../domain/DieticianMessage';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { DieticianConversationRepositoryPort } from '../../ports/DieticianConversationRepositoryPort';

export class InMemoryDieticianConversationRepository implements DieticianConversationRepositoryPort {
  private readonly conversations = new Map<string, DieticianConversation>();

  async findById(userId: string, conversationId: string): Promise<DieticianConversation | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    return clone(conversation);
  }

  async findOrCreate(userId: string, conversationId: string): Promise<DieticianConversation> {
    const existing = this.conversations.get(conversationId);
    if (existing) {
      if (existing.userId !== userId) {
        throw new NotFoundError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
      }
      return clone(existing);
    }

    const created: DieticianConversation = {
      id: conversationId,
      userId,
      createdAt: new Date(),
      turnCount: 0,
      digest: null,
      digestTurn: 0,
      messages: [],
    };
    this.conversations.set(conversationId, created);
    return clone(created);
  }

  async appendMessage(
    conversationId: string,
    role: DieticianMessageRole,
    content: string,
    origin: DieticianMessageOrigin = 'live',
  ): Promise<DieticianMessage> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new NotFoundError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }

    const proposal = decodeProposalMessage(content);
    const message: DieticianMessage = {
      id: randomUUID(),
      conversationId,
      role,
      content: proposal ? '' : content,
      origin,
      ...(proposal ? { proposal } : {}),
      createdAt: new Date(),
    };
    conversation.messages.push(message);
    return { ...message };
  }

  async saveDigest(conversationId: string, digest: ConversationDigest, atTurn: number): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new NotFoundError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }
    conversation.digest = digest;
    conversation.digestTurn = atTurn;
  }

  async incrementTurnCount(conversationId: string): Promise<number> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new NotFoundError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
    }
    conversation.turnCount += 1;
    return conversation.turnCount;
  }
}

function clone(conversation: DieticianConversation): DieticianConversation {
  return { ...conversation, messages: conversation.messages.map((message) => ({ ...message })) };
}
