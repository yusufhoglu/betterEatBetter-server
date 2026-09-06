import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { ConversationDigest } from '../../domain/ConversationDigest';
import type { DieticianConversationSummary } from '../../domain/ConversationSummary';
import { deriveDieticianPreview, deriveDieticianTitle } from '../../domain/ConversationSummary';
import type { DieticianConversation } from '../../domain/DieticianConversation';
import type {
  DieticianMessage,
  DieticianMessageOrigin,
  DieticianMessageRole,
} from '../../domain/DieticianMessage';
import { decodeRatingMessage, decodeRecipeMessage } from '../../domain/cardMessageCodec';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { DieticianConversationRepositoryPort } from '../../ports/DieticianConversationRepositoryPort';

export class InMemoryDieticianConversationRepository implements DieticianConversationRepositoryPort {
  private readonly conversations = new Map<string, DieticianConversation>();
  /** Monotonic clock so message ordering is deterministic in fast tests. */
  private clock = 0;

  private nextTimestamp(): Date {
    this.clock += 1;
    return new Date(this.clock);
  }

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
      createdAt: this.nextTimestamp(),
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
    const rating = decodeRatingMessage(content);
    const recipe = decodeRecipeMessage(content);
    const isCard = Boolean(proposal || rating || recipe);
    const message: DieticianMessage = {
      id: randomUUID(),
      conversationId,
      role,
      content: isCard ? '' : content,
      origin,
      ...(proposal ? { proposal } : {}),
      ...(rating ? { rating } : {}),
      ...(recipe ? { recipe } : {}),
      createdAt: this.nextTimestamp(),
    };
    conversation.messages.push(message);
    return { ...message };
  }

  async listByUser(userId: string, limit: number): Promise<DieticianConversationSummary[]> {
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
          turnCount: conversation.turnCount,
          title: deriveDieticianTitle(firstUser?.content),
          preview: deriveDieticianPreview(messages[messages.length - 1]!.content),
        };
      })
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())
      .slice(0, limit);
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
