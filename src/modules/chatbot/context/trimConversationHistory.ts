import type { LlmMessage } from '../../../shared/llm/types';

export const DEFAULT_MAX_CONTEXT_MESSAGES = 20;

/**
 * Simple "last N messages" window — no summarization this round. The system
 * message (persona/instructions), if present, is always kept and excluded
 * from the trimmed count.
 */
export function trimConversationHistory(
  messages: LlmMessage[],
  maxMessages: number = DEFAULT_MAX_CONTEXT_MESSAGES,
): LlmMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === 'system');
  const nonSystemMessages = messages.filter((message) => message.role !== 'system');
  const budget = Math.max(maxMessages - systemMessages.length, 0);

  return [...systemMessages, ...nonSystemMessages.slice(-budget)];
}
