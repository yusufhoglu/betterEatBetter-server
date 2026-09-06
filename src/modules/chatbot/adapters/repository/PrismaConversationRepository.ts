import type { Conversation as PrismaConversation, Message as PrismaMessage, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type { Conversation } from '../../domain/Conversation';
import type { ConversationSummary } from '../../domain/ConversationSummary';
import { deriveConversationPreview, deriveConversationTitle } from '../../domain/ConversationSummary';
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
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: row.createdAt },
    });

    return toDomainMessage(row);
  }

  async listByUser(userId: string, limit: number): Promise<ConversationSummary[]> {
    const rows = await this.db.conversation.findMany({
      where: { userId, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
      },
    });
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const [firstUserMessages, lastMessages] = await Promise.all([
      this.db.message.findMany({
        where: { conversationId: { in: ids }, role: 'user' },
        orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }],
        distinct: ['conversationId'],
        select: { conversationId: true, content: true },
      }),
      this.db.message.findMany({
        where: { conversationId: { in: ids } },
        orderBy: [{ conversationId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['conversationId'],
        select: { conversationId: true, content: true },
      }),
    ]);
    const firstUserByConversation = new Map(firstUserMessages.map((m) => [m.conversationId, m.content]));
    const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m.content]));

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt as Date,
      messageCount: row._count.messages,
      title: deriveConversationTitle(firstUserByConversation.get(row.id)),
      preview: deriveConversationPreview(lastByConversation.get(row.id)),
    }));
  }
}
