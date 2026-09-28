import { ConflictError } from '../../../shared/errors/ConflictError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import {
  chatAttachmentPrefix,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_BODY_LENGTH,
  type StoredAttachment,
} from '../domain/messagingTypes';
import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';
import type { RealtimePublisherPort } from '../ports/RealtimePublisherPort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import type { UnreadPushSchedulerPort } from '../ports/UnreadPushSchedulerPort';
import { presentMessage, type MessageView } from './presentMessage';
import { requireParticipant } from './requireParticipant';

const logger = createModuleLogger('messaging');

export interface SendMessageInput {
  senderId: string;
  threadId: string;
  clientMessageId: string;
  type: 'text' | 'image';
  body?: string | null;
  attachments?: StoredAttachment[];
}

/**
 * REST send, idempotent on clientMessageId: a retried request (flaky mobile
 * network) returns the original message and fans out nothing new. The
 * sender's own other devices also receive the realtime event.
 */
export class SendMessage {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly realtime: RealtimePublisherPort,
    private readonly pushScheduler: UnreadPushSchedulerPort,
    private readonly storage: ChatAttachmentStoragePort,
    private readonly rateLimit: (userId: string) => Promise<void> = async () => {},
  ) {}

  async execute(input: SendMessageInput): Promise<{ message: MessageView; created: boolean }> {
    const body = input.body?.trim() || null;
    const attachments = input.attachments ?? [];
    validate(input.senderId, input.type, body, attachments);

    const { thread } = await requireParticipant(this.repository, input.threadId, input.senderId);
    if (thread.readOnly) {
      throw new ForbiddenError('THREAD_READ_ONLY', 'This conversation has ended');
    }
    await this.rateLimit(input.senderId);

    const { message, created } = await this.repository.createMessage({
      threadId: thread.id,
      senderId: input.senderId,
      clientMessageId: input.clientMessageId,
      type: input.type,
      body,
      attachments,
    });
    if (message.senderId !== input.senderId) {
      throw new ConflictError('CLIENT_MESSAGE_ID_REUSED', 'clientMessageId already used in this thread');
    }

    const view = await presentMessage(message, this.storage);
    if (created) {
      await this.fanOut(thread.id, input.senderId, message.id, view);
    }
    return { message: view, created };
  }

  private async fanOut(threadId: string, senderId: string, messageId: string, view: MessageView): Promise<void> {
    try {
      const participants = await this.repository.listParticipants(threadId);
      await this.realtime.publish(
        participants.map((p) => p.userId),
        { type: 'message.created', threadId, message: view },
      );
      await Promise.all(
        participants
          .filter((p) => p.userId !== senderId)
          .map((p) => this.pushScheduler.schedule({ messageId, recipientId: p.userId })),
      );
    } catch (err) {
      // The message is stored; clients catch up on next fetch.
      logger.warn({ err, threadId, messageId }, 'message fan-out failed');
    }
  }
}

function validate(senderId: string, type: 'text' | 'image', body: string | null, attachments: StoredAttachment[]): void {
  if (body && body.length > MAX_MESSAGE_BODY_LENGTH) {
    throw new ValidationError('MESSAGE_TOO_LONG', `Messages are limited to ${MAX_MESSAGE_BODY_LENGTH} characters`);
  }
  if (type === 'text' && (!body || attachments.length > 0)) {
    throw new ValidationError('INVALID_MESSAGE', 'A text message needs a body and no attachments');
  }
  if (type === 'image' && (attachments.length === 0 || attachments.length > MAX_ATTACHMENTS_PER_MESSAGE)) {
    throw new ValidationError('INVALID_MESSAGE', `An image message needs 1-${MAX_ATTACHMENTS_PER_MESSAGE} attachments`);
  }
  const prefix = chatAttachmentPrefix(senderId);
  if (attachments.some((a) => !a.key.startsWith(prefix) || a.key.includes('..'))) {
    throw new ValidationError('INVALID_ATTACHMENT', 'Attachment was not uploaded by the sender');
  }
}
