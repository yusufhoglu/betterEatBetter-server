import type { Conversation as PrismaConversation, Message as PrismaMessage, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { Conversation } from '../../domain/Conversation';
import type { Message, MessageRole } from '../../domain/Message';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { ConversationRepositoryPort } from '../../ports/ConversationRepositoryPort';

type ConversationWithMessages = PrismaConversation & { messages: PrismaMessage[] };

function toDomainMessage(row: PrismaMessage): Message {
  const proposal = decodeProposalMessage(row.content);

  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: proposal ? '' : row.content,
    ...(proposal ? { proposal } : {}),
    createdAt: row.createdAt,
  };
}

function toDomainConversation(row: ConversationWithMessages): Conversation {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    messages: row.messages.map(toDomainMessage),
  };
}

export class PrismaConversationRepository implements ConversationRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findById(userId: string, conversationId: string): Promise<Conversation | null> {
    const row = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!row || row.userId !== userId) {
      return null;
    }

    return toDomainConversation(row);
  }

  async findOrCreate(userId: string, conversationId: string): Promise<Conversation> {
    const existing = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new NotFoundError('CONVERSATION_NOT_FOUND', 'Conversation was not found');
      }
      return toDomainConversation(existing);
    }

    const created = await this.db.conversation.create({
      data: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return toDomainConversation(created);
  }

  async appendMessage(conversationId: string, role: MessageRole, content: string): Promise<Message> {
    const row = await this.db.message.create({
      data: { conversationId, role, content },
    });

    return toDomainMessage(row);
  }
}
