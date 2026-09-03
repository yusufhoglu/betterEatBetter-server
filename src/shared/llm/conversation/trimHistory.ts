import type { LlmMessage } from '../types';

export const DEFAULT_MAX_HISTORY_MESSAGES = 20;

/**
 * Simple "last N messages" window shared by every LLM-conversation feature
 * (chatbot, dietician, ...). `system` messages (persona / instructions /
 * injected context blocks) are ALWAYS kept and excluded from the trimmed
 * count — trimming only drops the oldest user/assistant/tool turns.
 *
 * No summarization here on purpose: a feature that wants a rolling digest
 * builds one on top of this and passes it in as a `system` message.
 */
export function trimHistory(
  messages: LlmMessage[],
  maxMessages: number = DEFAULT_MAX_HISTORY_MESSAGES,
): LlmMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const systemMessages = messages.filter((message) => message.role === 'system');
  const nonSystemMessages = messages.filter((message) => message.role !== 'system');
  const budget = Math.max(maxMessages - systemMessages.length, 0);

  return [...systemMessages, ...nonSystemMessages.slice(-budget)];
}
