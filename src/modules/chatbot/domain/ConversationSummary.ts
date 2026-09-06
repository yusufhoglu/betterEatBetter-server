import { decodeProposalMessage } from './proposalMessageCodec';

/** One row of `GET /chat/conversations` — enough to render a history list entry. */
export interface ConversationSummary {
  id: string;
  createdAt: Date;
  /** max(messages.createdAt); never null here (empty conversations are excluded). */
  lastMessageAt: Date;
  messageCount: number;
  /** First user message, trimmed. Null when the thread has no user text yet. */
  title: string | null;
  /** Last message with human-readable text, trimmed. Null when there is none. */
  preview: string | null;
}

const TITLE_MAX = 80;
const PREVIEW_MAX = 160;

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

/** Plain text of a stored message, or null if it only carries a proposal card. */
export function readableMessageText(content: string): string | null {
  if (decodeProposalMessage(content)) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deriveConversationTitle(firstUserContent: string | null | undefined): string | null {
  if (!firstUserContent) {
    return null;
  }
  const text = readableMessageText(firstUserContent);
  return text ? truncate(text, TITLE_MAX) : null;
}

export function deriveConversationPreview(lastReadableContent: string | null | undefined): string | null {
  if (!lastReadableContent) {
    return null;
  }
  const text = readableMessageText(lastReadableContent);
  return text ? truncate(text, PREVIEW_MAX) : null;
}
