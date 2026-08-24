import type { Message } from './Message';

export interface Conversation {
  id: string;
  userId: string;
  createdAt: Date;
  messages: Message[];
}
