import type { LlmMessage } from '../../../shared/llm/types';
import { trimConversationHistory } from './trimConversationHistory';

function userMessage(n: number): LlmMessage {
  return { role: 'user', content: `message ${n}` };
}

describe('trimConversationHistory', () => {
  it('returns messages unchanged when at or under the threshold', () => {
    const messages = [userMessage(1), userMessage(2), userMessage(3)];

    expect(trimConversationHistory(messages, 5)).toEqual(messages);
    expect(trimConversationHistory(messages, 3)).toEqual(messages);
  });

  it('keeps only the most recent N messages when over the threshold', () => {
    const messages = Array.from({ length: 25 }, (_, i) => userMessage(i + 1));

    const trimmed = trimConversationHistory(messages, 20);

    expect(trimmed).toHaveLength(20);
    expect(trimmed[0]).toEqual(userMessage(6));
    expect(trimmed[trimmed.length - 1]).toEqual(userMessage(25));
  });

  it('always preserves the system message, excluded from the trim budget', () => {
    const systemMessage: LlmMessage = { role: 'system', content: 'You are a helpful nutrition assistant.' };
    const messages = [systemMessage, ...Array.from({ length: 25 }, (_, i) => userMessage(i + 1))];

    const trimmed = trimConversationHistory(messages, 10);

    expect(trimmed[0]).toEqual(systemMessage);
    expect(trimmed).toHaveLength(10);
    expect(trimmed.slice(1)).toEqual(
      Array.from({ length: 9 }, (_, i) => userMessage(17 + i)),
    );
  });

  it('uses the default threshold of 20 when none is passed', () => {
    const messages = Array.from({ length: 30 }, (_, i) => userMessage(i + 1));

    expect(trimConversationHistory(messages)).toHaveLength(20);
  });
});
