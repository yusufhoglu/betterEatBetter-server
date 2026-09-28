import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { RealtimePublisherPort } from '../ports/RealtimePublisherPort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import { requireParticipant } from './requireParticipant';

/** Marks everything up to and including `messageId` as read (never moves backwards). */
export class MarkThreadRead {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly realtime: RealtimePublisherPort,
  ) {}

  async execute(userId: string, threadId: string, messageId: string): Promise<{ lastReadAt: string }> {
    await requireParticipant(this.repository, threadId, userId);
    const message = await this.repository.findMessage(messageId);
    if (!message || message.threadId !== threadId) {
      throw new NotFoundError('MESSAGE_NOT_FOUND', 'Message not found');
    }

    const lastReadAt = (await this.repository.markRead(threadId, userId, message.createdAt)).toISOString();
    const participants = await this.repository.listParticipants(threadId);
    await this.realtime.publish(
      participants.map((p) => p.userId),
      { type: 'thread.read', threadId, userId, lastReadAt },
    );
    return { lastReadAt };
  }
}
