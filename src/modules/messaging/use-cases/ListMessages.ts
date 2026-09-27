import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import { presentMessage, type MessageView } from './presentMessage';
import { requireParticipant } from './requireParticipant';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface MessagePage {
  items: MessageView[];
  /** Pass as `before` for the next (older) page; null when exhausted. */
  nextBefore: string | null;
  readOnly: boolean;
  /** When each other participant last read the thread — for "seen" ticks. */
  readReceipts: Array<{ userId: string; lastReadAt: string | null }>;
}

export class ListMessages {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly storage: ChatAttachmentStoragePort,
  ) {}

  async execute(userId: string, threadId: string, input: { before?: string; limit?: number }): Promise<MessagePage> {
    const { thread } = await requireParticipant(this.repository, threadId, userId);
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const [messages, participants] = await Promise.all([
      this.repository.listMessages(threadId, { before: input.before, limit }),
      this.repository.listParticipants(threadId),
    ]);

    return {
      items: await Promise.all(messages.map((message) => presentMessage(message, this.storage))),
      nextBefore: messages.length === limit ? messages[messages.length - 1]!.id : null,
      readOnly: thread.readOnly,
      readReceipts: participants
        .filter((p) => p.userId !== userId)
        .map((p) => ({ userId: p.userId, lastReadAt: p.lastReadAt?.toISOString() ?? null })),
    };
  }
}
