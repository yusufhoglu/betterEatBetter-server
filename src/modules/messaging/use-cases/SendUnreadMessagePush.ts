import type { PeopleDirectoryPort } from '../ports/PeopleDirectoryPort';
import type { ChatPushPort } from '../ports/PushSenderPort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';

const PREVIEW_LENGTH = 120;

/**
 * Runs from the delayed job. Skips the push when the recipient has already
 * read the message (chat was open), left the thread, or the sender is gone.
 */
export class SendUnreadMessagePush {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly people: PeopleDirectoryPort,
    private readonly push: ChatPushPort,
  ) {}

  async execute(input: { messageId: string; recipientId: string }): Promise<'sent' | 'skipped'> {
    const message = await this.repository.findMessage(input.messageId);
    if (!message || !message.senderId) {
      return 'skipped';
    }
    const participant = await this.repository.findParticipant(message.threadId, input.recipientId);
    if (!participant || (participant.lastReadAt && participant.lastReadAt >= message.createdAt)) {
      return 'skipped';
    }

    const sender = (await this.people.getPeople([message.senderId])).get(message.senderId);
    const body =
      message.type === 'image'
        ? '📷 Fotoğraf'
        : (message.body ?? '').length > PREVIEW_LENGTH
          ? `${message.body!.slice(0, PREVIEW_LENGTH - 1)}…`
          : (message.body ?? '');

    await this.push.send({
      userId: input.recipientId,
      title: sender?.name ?? sender?.username ?? 'Yeni mesaj',
      body,
      data: { type: 'chat_message', threadId: message.threadId, messageId: message.id },
    });
    return 'sent';
  }
}
