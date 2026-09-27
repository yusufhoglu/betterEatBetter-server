import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  ChatMessage,
  MessageType,
  StoredAttachment,
  Thread,
  ThreadKind,
  ThreadParticipant,
} from '../../domain/messagingTypes';
import type { CreateMessageInput, ThreadRepositoryPort, ThreadSummaryRow } from '../../ports/ThreadRepositoryPort';

type ThreadRow = Prisma.ThreadGetPayload<object>;
type MessageRow = Prisma.ChatMessageGetPayload<object>;

function toThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    kind: row.kind as ThreadKind,
    refId: row.refId,
    readOnly: row.readOnly,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    senderId: row.senderId,
    clientMessageId: row.clientMessageId,
    type: row.type as MessageType,
    body: row.body,
    attachments: Array.isArray(row.attachments) ? (row.attachments as unknown as StoredAttachment[]) : [],
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaThreadRepository implements ThreadRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async ensureThread(kind: ThreadKind, refId: string, participantIds: string[]): Promise<Thread> {
    let thread = await this.db.thread.findFirst({ where: { kind, refId } });
    if (!thread) {
      try {
        thread = await this.db.thread.create({ data: { kind, refId } });
      } catch (err) {
        // Lost a race against a concurrent ensureThread — (kind, refId) is unique.
        if (!isUniqueViolation(err)) {
          throw err;
        }
        thread = await this.db.thread.findFirstOrThrow({ where: { kind, refId } });
      }
    }
    await this.db.threadParticipant.createMany({
      data: participantIds.map((userId) => ({ threadId: thread.id, userId })),
      skipDuplicates: true,
    });
    return toThread(thread);
  }

  async findThreadByRef(kind: ThreadKind, refId: string): Promise<Thread | null> {
    const row = await this.db.thread.findFirst({ where: { kind, refId } });
    return row ? toThread(row) : null;
  }

  async findThread(threadId: string): Promise<Thread | null> {
    const row = await this.db.thread.findUnique({ where: { id: threadId } });
    return row ? toThread(row) : null;
  }

  async findParticipant(threadId: string, userId: string): Promise<ThreadParticipant | null> {
    return this.db.threadParticipant.findUnique({ where: { threadId_userId: { threadId, userId } } });
  }

  async listParticipants(threadId: string): Promise<ThreadParticipant[]> {
    return this.db.threadParticipant.findMany({ where: { threadId }, orderBy: { joinedAt: 'asc' } });
  }

  async listThreadsForUser(userId: string): Promise<ThreadSummaryRow[]> {
    const memberships = await this.db.threadParticipant.findMany({
      where: { userId },
      include: {
        thread: {
          include: {
            participants: { select: { userId: true } },
            messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (memberships.length === 0) {
      return [];
    }

    // One grouped count for all threads instead of N queries.
    const unread = await this.db.$queryRaw<Array<{ threadId: string; count: bigint }>>`
      SELECT m."threadId", COUNT(*) AS "count"
      FROM "chat_messages" m
      JOIN "thread_participants" p ON p."threadId" = m."threadId" AND p."userId" = ${userId}
      WHERE m."deletedAt" IS NULL
        AND (m."senderId" IS DISTINCT FROM ${userId})
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
      GROUP BY m."threadId"`;
    const unreadByThread = new Map(unread.map((row) => [row.threadId, Number(row.count)]));

    return memberships
      .map(({ thread }) => ({
        thread: toThread(thread),
        participantIds: thread.participants.map((p) => p.userId),
        lastMessage: thread.messages[0] ? toMessage(thread.messages[0]) : null,
        unreadCount: unreadByThread.get(thread.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          (b.thread.lastMessageAt ?? b.thread.createdAt).getTime() - (a.thread.lastMessageAt ?? a.thread.createdAt).getTime(),
      );
  }

  async setReadOnly(threadId: string, readOnly: boolean): Promise<void> {
    await this.db.thread.update({ where: { id: threadId }, data: { readOnly } });
  }

  async replaceParticipant(threadId: string, oldUserId: string, newUserId: string): Promise<void> {
    await this.db.$transaction([
      this.db.threadParticipant.deleteMany({ where: { threadId, userId: oldUserId } }),
      this.db.threadParticipant.createMany({ data: [{ threadId, userId: newUserId }], skipDuplicates: true }),
    ]);
  }

  async createMessage(input: CreateMessageInput): Promise<{ message: ChatMessage; created: boolean }> {
    try {
      const row = await this.db.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            threadId: input.threadId,
            senderId: input.senderId,
            clientMessageId: input.clientMessageId,
            type: input.type,
            body: input.body,
            attachments: input.attachments.length ? (input.attachments as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });
        await tx.thread.update({ where: { id: input.threadId }, data: { lastMessageAt: created.createdAt } });
        return created;
      });
      return { message: toMessage(row), created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      const existing = await this.db.chatMessage.findUniqueOrThrow({
        where: { threadId_clientMessageId: { threadId: input.threadId, clientMessageId: input.clientMessageId } },
      });
      return { message: toMessage(existing), created: false };
    }
  }

  async findMessage(messageId: string): Promise<ChatMessage | null> {
    const row = await this.db.chatMessage.findUnique({ where: { id: messageId } });
    return row && !row.deletedAt ? toMessage(row) : null;
  }

  async listMessages(threadId: string, input: { before?: string; limit: number }): Promise<ChatMessage[]> {
    const cursor = input.before
      ? await this.db.chatMessage.findFirst({ where: { id: input.before, threadId }, select: { createdAt: true, id: true } })
      : null;

    const rows = await this.db.chatMessage.findMany({
      where: {
        threadId,
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });
    return rows.map(toMessage);
  }

  async markRead(threadId: string, userId: string, readAt: Date): Promise<Date> {
    const [row] = await this.db.$queryRaw<Array<{ lastReadAt: Date }>>`
      UPDATE "thread_participants"
      SET "lastReadAt" = GREATEST(COALESCE("lastReadAt", ${readAt}), ${readAt})
      WHERE "threadId" = ${threadId} AND "userId" = ${userId}
      RETURNING "lastReadAt"`;
    return row?.lastReadAt ?? readAt;
  }
}
