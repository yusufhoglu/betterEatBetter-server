import { randomUUID } from 'node:crypto';
import type { ChatMessage, Thread, ThreadKind, ThreadParticipant } from '../../domain/messagingTypes';
import type { CreateMessageInput, ThreadRepositoryPort, ThreadSummaryRow } from '../../ports/ThreadRepositoryPort';

export class InMemoryThreadRepository implements ThreadRepositoryPort {
  readonly threads: Thread[] = [];
  readonly participants: ThreadParticipant[] = [];
  readonly messages: ChatMessage[] = [];
  private clock = Date.parse('2026-09-27T10:00:00.000Z');

  private tick(): Date {
    this.clock += 1000;
    return new Date(this.clock);
  }

  async ensureThread(kind: ThreadKind, refId: string, participantIds: string[]): Promise<Thread> {
    let thread = this.threads.find((t) => t.kind === kind && t.refId === refId);
    if (!thread) {
      thread = { id: randomUUID(), kind, refId, readOnly: false, createdAt: this.tick(), lastMessageAt: null };
      this.threads.push(thread);
    }
    for (const userId of participantIds) {
      if (!this.participants.some((p) => p.threadId === thread!.id && p.userId === userId)) {
        this.participants.push({ threadId: thread.id, userId, lastReadAt: null, joinedAt: this.tick() });
      }
    }
    return thread;
  }

  async findThreadByRef(kind: ThreadKind, refId: string): Promise<Thread | null> {
    return this.threads.find((t) => t.kind === kind && t.refId === refId) ?? null;
  }

  async findThread(threadId: string): Promise<Thread | null> {
    return this.threads.find((t) => t.id === threadId) ?? null;
  }

  async findParticipant(threadId: string, userId: string): Promise<ThreadParticipant | null> {
    return this.participants.find((p) => p.threadId === threadId && p.userId === userId) ?? null;
  }

  async listParticipants(threadId: string): Promise<ThreadParticipant[]> {
    return this.participants.filter((p) => p.threadId === threadId);
  }

  async listThreadsForUser(userId: string): Promise<ThreadSummaryRow[]> {
    return this.participants
      .filter((p) => p.userId === userId)
      .map((p) => {
        const thread = this.threads.find((t) => t.id === p.threadId)!;
        const messages = this.messages.filter((m) => m.threadId === thread.id);
        return {
          thread,
          participantIds: this.participants.filter((x) => x.threadId === thread.id).map((x) => x.userId),
          lastMessage: messages[messages.length - 1] ?? null,
          unreadCount: messages.filter((m) => m.senderId !== userId && (!p.lastReadAt || m.createdAt > p.lastReadAt)).length,
        };
      });
  }

  async setReadOnly(threadId: string, readOnly: boolean): Promise<void> {
    this.threads.find((t) => t.id === threadId)!.readOnly = readOnly;
  }

  async replaceParticipant(threadId: string, oldUserId: string, newUserId: string): Promise<void> {
    const p = this.participants.find((x) => x.threadId === threadId && x.userId === oldUserId);
    if (p) {
      p.userId = newUserId;
      p.lastReadAt = null;
    }
  }

  async createMessage(input: CreateMessageInput): Promise<{ message: ChatMessage; created: boolean }> {
    const existing = this.messages.find((m) => m.threadId === input.threadId && m.clientMessageId === input.clientMessageId);
    if (existing) {
      return { message: existing, created: false };
    }
    const message: ChatMessage = { id: randomUUID(), ...input, createdAt: this.tick() };
    this.messages.push(message);
    this.threads.find((t) => t.id === input.threadId)!.lastMessageAt = message.createdAt;
    return { message, created: true };
  }

  async findMessage(messageId: string): Promise<ChatMessage | null> {
    return this.messages.find((m) => m.id === messageId) ?? null;
  }

  async listMessages(threadId: string, input: { before?: string; limit: number }): Promise<ChatMessage[]> {
    const all = this.messages.filter((m) => m.threadId === threadId).reverse();
    const start = input.before ? all.findIndex((m) => m.id === input.before) + 1 : 0;
    return all.slice(start, start + input.limit);
  }

  async markRead(threadId: string, userId: string, readAt: Date): Promise<Date> {
    const p = this.participants.find((x) => x.threadId === threadId && x.userId === userId)!;
    if (!p.lastReadAt || p.lastReadAt < readAt) {
      p.lastReadAt = readAt;
    }
    return p.lastReadAt;
  }
}
