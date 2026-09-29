import type { DieticianMessage } from '../domain/DieticianMessage';
import type {
  AssistantConversationSummary,
  DieticianConversationRepositoryPort,
} from '../ports/DieticianConversationRepositoryPort';

export interface AssistantTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card: { kind: 'proposal' | 'rating' | 'recipe'; title: string } | null;
  createdAt: Date;
}

function toTranscriptMessage(message: DieticianMessage): AssistantTranscriptMessage {
  let card: AssistantTranscriptMessage['card'] = null;
  if (message.proposal) {
    card = { kind: 'proposal', title: message.proposal.rawDescription };
  } else if (message.rating) {
    card = { kind: 'rating', title: `${message.rating.mealName} — ${message.rating.score}/10` };
  } else if (message.recipe) {
    card = { kind: 'recipe', title: message.recipe.title };
  }
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    card,
    createdAt: message.createdAt,
  };
}

/**
 * Public read side for the `practice` module: the turns a dietitian's AI
 * assistant handled, for that dietitian's review. Scoped by the stamp on each
 * message — a client's AI chats from before (or with another dietitian) never
 * show. Authorization and consent are the caller's job (practice policy).
 */
export class AssistantTranscripts {
  constructor(private readonly repository: DieticianConversationRepositoryPort) {}

  list(userId: string, dietitianId: string, since: Date, limit: number): Promise<AssistantConversationSummary[]> {
    return this.repository.listAssistantConversations(userId, dietitianId, since, limit);
  }

  async get(
    userId: string,
    conversationId: string,
    dietitianId: string,
    since: Date,
  ): Promise<AssistantTranscriptMessage[] | null> {
    const messages = await this.repository.findAssistantMessages(userId, conversationId, dietitianId, since);
    if (!messages) {
      return null;
    }
    return messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map(toTranscriptMessage);
  }

  /** An assistant reply produced for `dietitianId`, or null. */
  async findAssistantMessage(messageId: string, dietitianId: string): Promise<{ id: string; content: string } | null> {
    const message = await this.repository.findMessage(messageId);
    if (!message || message.role !== 'assistant' || message.dietitianId !== dietitianId) {
      return null;
    }
    return { id: message.id, content: message.content };
  }
}
