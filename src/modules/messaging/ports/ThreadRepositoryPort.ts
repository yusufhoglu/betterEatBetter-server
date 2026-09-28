import type { ChatMessage, MessageType, StoredAttachment, Thread, ThreadKind, ThreadParticipant } from '../domain/messagingTypes';

export interface CreateMessageInput {
  threadId: string;
  senderId: string | null;
  clientMessageId: string;
  type: MessageType;
  body: string | null;
  attachments: StoredAttachment[];
}

export interface ThreadSummaryRow {
  thread: Thread;
  participantIds: string[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

export interface ThreadRepositoryPort {
  /** Idempotent on (kind, refId). Adds any missing participants. */
  ensureThread(kind: ThreadKind, refId: string, participantIds: string[]): Promise<Thread>;
  findThreadByRef(kind: ThreadKind, refId: string): Promise<Thread | null>;
  findThread(threadId: string): Promise<Thread | null>;
  findParticipant(threadId: string, userId: string): Promise<ThreadParticipant | null>;
  listParticipants(threadId: string): Promise<ThreadParticipant[]>;
  listThreadsForUser(userId: string): Promise<ThreadSummaryRow[]>;
  setReadOnly(threadId: string, readOnly: boolean): Promise<void>;
  replaceParticipant(threadId: string, oldUserId: string, newUserId: string): Promise<void>;

  /** Idempotent on (threadId, clientMessageId): a retry returns the original with created=false. */
  createMessage(input: CreateMessageInput): Promise<{ message: ChatMessage; created: boolean }>;
  findMessage(messageId: string): Promise<ChatMessage | null>;
  /** Newest first. `before` is a message id (exclusive). */
  listMessages(threadId: string, input: { before?: string; limit: number }): Promise<ChatMessage[]>;
  /** Monotonic: never moves lastReadAt backwards. Returns the resulting value. */
  markRead(threadId: string, userId: string, readAt: Date): Promise<Date>;
}
