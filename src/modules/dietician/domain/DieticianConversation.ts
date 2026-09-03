import type { ConversationDigest } from './ConversationDigest';
import type { DieticianMessage } from './DieticianMessage';

export interface DieticianConversation {
  id: string;
  userId: string;
  createdAt: Date;
  /** Count of completed user↔assistant exchanges — drives digest refresh cadence. */
  turnCount: number;
  digest: ConversationDigest | null;
  /** `turnCount` value the digest was last rebuilt at. */
  digestTurn: number;
  messages: DieticianMessage[];
}
