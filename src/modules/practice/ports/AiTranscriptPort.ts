/** A client↔AI-assistant conversation as the reviewing dietitian sees it. */
export interface AiTranscriptSummary {
  conversationId: string;
  title: string | null;
  lastMessageAt: Date;
  messageCount: number;
}

export interface AiTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** A card the assistant produced instead of prose (meal log proposal, rating, recipe). */
  card: { kind: 'proposal' | 'rating' | 'recipe'; title: string } | null;
  createdAt: Date;
}

/**
 * Read access to the AI coach's conversations (owned by the `dietician`
 * module). Returns ONLY messages the assistant handled for `dietitianId`, at or
 * after `since` — never the client's earlier private AI chats. Does not check
 * authorization: the caller must have passed `ClientAccessPolicy` first.
 */
export interface AiTranscriptPort {
  listConversations(clientId: string, dietitianId: string, since: Date, limit: number): Promise<AiTranscriptSummary[]>;
  /** null → no such conversation for this client/dietitian. */
  getConversation(
    clientId: string,
    conversationId: string,
    dietitianId: string,
    since: Date,
  ): Promise<AiTranscriptMessage[] | null>;
  /** The assistant message, if it was produced for `dietitianId` (used to validate corrections). */
  findAssistantMessage(messageId: string, dietitianId: string): Promise<{ id: string; content: string } | null>;
}
