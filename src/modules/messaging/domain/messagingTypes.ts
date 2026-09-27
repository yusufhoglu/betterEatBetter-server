export type ThreadKind = 'dietitian_client';
export type MessageType = 'text' | 'image' | 'system';

export const MAX_MESSAGE_BODY_LENGTH = 4000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 4;

export interface Thread {
  id: string;
  kind: ThreadKind;
  refId: string | null;
  readOnly: boolean;
  createdAt: Date;
  lastMessageAt: Date | null;
}

export interface ThreadParticipant {
  threadId: string;
  userId: string;
  lastReadAt: Date | null;
  joinedAt: Date;
}

/** Stored form: an object-storage key, never a URL (URLs are signed per read). */
export interface StoredAttachment {
  kind: 'image';
  key: string;
  contentType: string;
  width?: number;
  height?: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  /** Null for system messages and for senders who deleted their account. */
  senderId: string | null;
  clientMessageId: string;
  type: MessageType;
  body: string | null;
  attachments: StoredAttachment[];
  createdAt: Date;
}

export interface PersonSummary {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

/** Everything pushed over the realtime stream. */
export type RealtimeEvent =
  | { type: 'message.created'; threadId: string; message: unknown }
  | { type: 'thread.read'; threadId: string; userId: string; lastReadAt: string }
  | { type: 'thread.updated'; threadId: string; readOnly: boolean };

/** Key namespace a user may attach from; validated on send so nobody references another user's objects. */
export function chatAttachmentPrefix(userId: string): string {
  return `users/${userId}/chat/`;
}
