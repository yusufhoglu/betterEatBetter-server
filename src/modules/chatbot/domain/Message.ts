import type { MealLogProposal } from './MealLogProposal';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  proposal?: MealLogProposal;
  createdAt: Date;
}
