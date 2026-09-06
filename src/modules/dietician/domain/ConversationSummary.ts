import { decodeRatingMessage, decodeRecipeMessage } from './cardMessageCodec';
import { decodeProposalMessage } from './proposalMessageCodec';

/** One row of `GET /dietician/conversations` — a coaching-thread history entry. */
export interface DieticianConversationSummary {
  id: string;
  createdAt: Date;
  /** max(messages.createdAt); never null here (empty threads are excluded). */
  lastMessageAt: Date;
  messageCount: number;
  turnCount: number;
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

/** Plain text of a stored message, or null when it only carries a card (proposal/rating/recipe). */
export function readableDieticianMessageText(content: string): string | null {
  if (decodeProposalMessage(content) || decodeRatingMessage(content) || decodeRecipeMessage(content)) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function deriveDieticianTitle(firstUserContent: string | null | undefined): string | null {
  if (!firstUserContent) {
    return null;
  }
  const text = readableDieticianMessageText(firstUserContent);
  return text ? truncate(text, TITLE_MAX) : null;
}

export function deriveDieticianPreview(lastContent: string | null | undefined): string | null {
  if (!lastContent) {
    return null;
  }
  const text = readableDieticianMessageText(lastContent);
  return text ? truncate(text, PREVIEW_MAX) : null;
}
