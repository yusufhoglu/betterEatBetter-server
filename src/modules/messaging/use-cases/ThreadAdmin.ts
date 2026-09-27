import { randomUUID } from 'node:crypto';
import type { ThreadKind } from '../domain/messagingTypes';
import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';
import type { RealtimePublisherPort } from '../ports/RealtimePublisherPort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import { presentMessage } from './presentMessage';

/**
 * Public entry point for modules that own a conversation's lifecycle (today:
 * practice, one thread per dietitian-client link). Threads are addressed by
 * (kind, refId) so the caller never stores messaging ids.
 */
export class ThreadAdmin {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly realtime: RealtimePublisherPort,
    private readonly storage: ChatAttachmentStoragePort,
  ) {}

  async ensureThread(kind: ThreadKind, refId: string, participantIds: string[]): Promise<string> {
    return (await this.repository.ensureThread(kind, refId, participantIds)).id;
  }

  async findThreadId(kind: ThreadKind, refId: string): Promise<string | null> {
    return (await this.repository.findThreadByRef(kind, refId))?.id ?? null;
  }

  /** Read-only from now on; history stays. */
  async close(kind: ThreadKind, refId: string, systemMessage: string): Promise<void> {
    const thread = await this.repository.findThreadByRef(kind, refId);
    if (!thread) {
      return;
    }
    await this.postSystemMessage(kind, refId, systemMessage);
    await this.repository.setReadOnly(thread.id, true);
    const participants = await this.repository.listParticipants(thread.id);
    await this.realtime.publish(
      participants.map((p) => p.userId),
      { type: 'thread.updated', threadId: thread.id, readOnly: true },
    );
  }

  async replaceParticipant(
    kind: ThreadKind,
    refId: string,
    oldUserId: string,
    newUserId: string,
    systemMessage: string,
  ): Promise<void> {
    const thread = await this.repository.findThreadByRef(kind, refId);
    if (!thread) {
      return;
    }
    await this.repository.replaceParticipant(thread.id, oldUserId, newUserId);
    await this.postSystemMessage(kind, refId, systemMessage);
  }

  /**
   * When `userId` started waiting: the oldest of their messages sent after
   * the other side last wrote. null = nothing waiting for a reply.
   */
  async unansweredSince(kind: ThreadKind, refId: string, userId: string): Promise<Date | null> {
    const thread = await this.repository.findThreadByRef(kind, refId);
    if (!thread) {
      return null;
    }
    let since: Date | null = null;
    for (const message of await this.repository.listMessages(thread.id, { limit: 50 })) {
      if (message.type === 'system') continue;
      if (message.senderId !== userId) break;
      since = message.createdAt;
    }
    return since;
  }

  async postSystemMessage(kind: ThreadKind, refId: string, body: string): Promise<void> {
    const thread = await this.repository.findThreadByRef(kind, refId);
    if (!thread) {
      return;
    }
    const { message } = await this.repository.createMessage({
      threadId: thread.id,
      senderId: null,
      clientMessageId: `system:${randomUUID()}`,
      type: 'system',
      body,
      attachments: [],
    });
    const participants = await this.repository.listParticipants(thread.id);
    await this.realtime.publish(
      participants.map((p) => p.userId),
      { type: 'message.created', threadId: thread.id, message: await presentMessage(message, this.storage) },
    );
  }
}
