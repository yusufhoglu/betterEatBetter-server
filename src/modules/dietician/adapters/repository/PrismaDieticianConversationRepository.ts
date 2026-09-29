import { Prisma } from '@prisma/client';
import type {
  DieticianConversation as PrismaDieticianConversation,
  DieticianMessage as PrismaDieticianMessage,
  PrismaClient,
} from '@prisma/client';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import { conversationDigestSchema, type ConversationDigest } from '../../domain/ConversationDigest';
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
import type {
  AssistantConversationSummary,
  DieticianConversationRepositoryPort,
} from '../../ports/DieticianConversationRepositoryPort';

type ConversationWithMessages = PrismaDieticianConversation & { messages: PrismaDieticianMessage[] };

function parseDigest(value: Prisma.JsonValue | null): ConversationDigest | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const parsed = conversationDigestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toDomainMessage(row: PrismaDieticianMessage): DieticianMessage {
  const proposal = decodeProposalMessage(row.content);
  const rating = decodeRatingMessage(row.content);
  const recipe = decodeRecipeMessage(row.content);
  const isCard = Boolean(proposal || rating || recipe);
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as DieticianMessageRole,
    content: isCard ? '' : row.content,
    origin: row.origin as DieticianMessageOrigin,
    dietitianId: row.dietitianId,
    ...(proposal ? { proposal } : {}),
    ...(rating ? { rating } : {}),
    ...(recipe ? { recipe } : {}),
    createdAt: row.createdAt,
  };
}

function toDomainConversation(row: ConversationWithMessages): DieticianConversation {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    turnCount: row.turnCount,
    digest: parseDigest(row.digest),
    digestTurn: row.digestTurn,
    messages: row.messages.map(toDomainMessage),
  };
}

export class PrismaDieticianConversationRepository implements DieticianConversationRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async findById(userId: string, conversationId: string): Promise<DieticianConversation | null> {
    const row = await this.db.dieticianConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!row || row.userId !== userId) {
      return null;
    }

    return toDomainConversation(row);
  }

  async findOrCreate(userId: string, conversationId: string): Promise<DieticianConversation> {
    const existing = await this.db.dieticianConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new NotFoundError('DIETICIAN_CONVERSATION_NOT_FOUND', 'Conversation was not found');
      }
      return toDomainConversation(existing);
    }

    const created = await this.db.dieticianConversation.create({
      data: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return toDomainConversation(created);
  }

  async appendMessage(
    conversationId: string,
    role: DieticianMessageRole,
    content: string,
    origin: DieticianMessageOrigin = 'live',
    dietitianId: string | null = null,
  ): Promise<DieticianMessage> {
    const row = await this.db.dieticianMessage.create({
      data: { conversationId, role, content, origin, dietitianId },
    });
    await this.db.dieticianConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: row.createdAt },
    });

    return toDomainMessage(row);
  }

  async listByUser(userId: string, limit: number): Promise<DieticianConversationSummary[]> {
    const rows = await this.db.dieticianConversation.findMany({
      where: { userId, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        lastMessageAt: true,
        turnCount: true,
        _count: { select: { messages: true } },
      },
    });
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const [firstUserMessages, lastMessages] = await Promise.all([
      this.db.dieticianMessage.findMany({
        where: { conversationId: { in: ids }, role: 'user' },
        orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }],
        distinct: ['conversationId'],
        select: { conversationId: true, content: true },
      }),
      this.db.dieticianMessage.findMany({
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
      turnCount: row.turnCount,
      title: deriveDieticianTitle(firstUserByConversation.get(row.id)),
      preview: deriveDieticianPreview(lastByConversation.get(row.id)),
    }));
  }

  async listAssistantConversations(
    userId: string,
    dietitianId: string,
    since: Date,
    limit: number,
  ): Promise<AssistantConversationSummary[]> {
    const stamped = { dietitianId, createdAt: { gte: since }, role: { in: ['user', 'assistant'] } };
    const groups = await this.db.dieticianMessage.groupBy({
      by: ['conversationId'],
      where: { ...stamped, conversation: { userId } },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      take: limit,
    });
    if (groups.length === 0) {
      return [];
    }

    const firstUserMessages = await this.db.dieticianMessage.findMany({
      where: { ...stamped, role: 'user', conversationId: { in: groups.map((g) => g.conversationId) } },
      orderBy: [{ conversationId: 'asc' }, { createdAt: 'asc' }],
      distinct: ['conversationId'],
      select: { conversationId: true, content: true },
    });
    const titles = new Map(firstUserMessages.map((m) => [m.conversationId, m.content]));

    return groups.map((group) => ({
      id: group.conversationId,
      title: deriveDieticianTitle(titles.get(group.conversationId)),
      lastMessageAt: group._max.createdAt as Date,
      messageCount: group._count._all,
    }));
  }

  async findAssistantMessages(
    userId: string,
    conversationId: string,
    dietitianId: string,
    since: Date,
  ): Promise<DieticianMessage[] | null> {
    const conversation = await this.db.dieticianConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conversation || conversation.userId !== userId) {
      return null;
    }
    const rows = await this.db.dieticianMessage.findMany({
      where: { conversationId, dietitianId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomainMessage);
  }

  async findMessage(messageId: string): Promise<DieticianMessage | null> {
    const row = await this.db.dieticianMessage.findUnique({ where: { id: messageId } });
    return row ? toDomainMessage(row) : null;
  }

  async saveDigest(conversationId: string, digest: ConversationDigest, atTurn: number): Promise<void> {
    await this.db.dieticianConversation.update({
      where: { id: conversationId },
      data: { digest: digest as unknown as Prisma.InputJsonValue, digestTurn: atTurn },
    });
  }

  async incrementTurnCount(conversationId: string): Promise<number> {
    const updated = await this.db.dieticianConversation.update({
      where: { id: conversationId },
      data: { turnCount: { increment: 1 } },
      select: { turnCount: true },
    });

    return updated.turnCount;
  }
}
