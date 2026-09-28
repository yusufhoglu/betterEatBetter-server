import type { PersonSummary } from '../domain/messagingTypes';
import type { ChatAttachmentStoragePort } from '../ports/ChatAttachmentStoragePort';
import type { PeopleDirectoryPort } from '../ports/PeopleDirectoryPort';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';
import { presentMessage, type MessageView } from './presentMessage';

export interface ThreadListItem {
  id: string;
  kind: string;
  refId: string | null;
  readOnly: boolean;
  lastMessageAt: string | null;
  lastMessage: MessageView | null;
  unreadCount: number;
  /** Everyone in the thread except the caller. */
  counterparts: PersonSummary[];
}

export class ListThreads {
  constructor(
    private readonly repository: ThreadRepositoryPort,
    private readonly people: PeopleDirectoryPort,
    private readonly storage: ChatAttachmentStoragePort,
  ) {}

  async execute(userId: string): Promise<ThreadListItem[]> {
    const rows = await this.repository.listThreadsForUser(userId);
    const people = await this.people.getPeople([...new Set(rows.flatMap((row) => row.participantIds))]);

    return Promise.all(
      rows.map(async (row) => ({
        id: row.thread.id,
        kind: row.thread.kind,
        refId: row.thread.refId,
        readOnly: row.thread.readOnly,
        lastMessageAt: row.thread.lastMessageAt?.toISOString() ?? null,
        lastMessage: row.lastMessage ? await presentMessage(row.lastMessage, this.storage) : null,
        unreadCount: row.unreadCount,
        counterparts: row.participantIds
          .filter((id) => id !== userId)
          .map((id) => people.get(id) ?? { userId: id, name: null, username: null, avatarUrl: null }),
      })),
    );
  }
}
