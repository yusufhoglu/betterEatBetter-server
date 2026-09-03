import { Prisma } from '@prisma/client';
import type {
  DieticianConversation as PrismaDieticianConversation,
  DieticianMessage as PrismaDieticianMessage,
  PrismaClient,
} from '@prisma/client';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import { conversationDigestSchema, type ConversationDigest } from '../../domain/ConversationDigest';
import type { DieticianConversation } from '../../domain/DieticianConversation';
import type {
  DieticianMessage,
  DieticianMessageOrigin,
  DieticianMessageRole,
} from '../../domain/DieticianMessage';
import { decodeProposalMessage } from '../../domain/proposalMessageCodec';
import type { DieticianConversationRepositoryPort } from '../../ports/DieticianConversationRepositoryPort';

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
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as DieticianMessageRole,
    content: proposal ? '' : row.content,
    origin: row.origin as DieticianMessageOrigin,
    ...(proposal ? { proposal } : {}),
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
  ): Promise<DieticianMessage> {
    const row = await this.db.dieticianMessage.create({
      data: { conversationId, role, content, origin },
    });

    return toDomainMessage(row);
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
