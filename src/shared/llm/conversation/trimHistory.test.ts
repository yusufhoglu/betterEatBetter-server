import type { LlmMessage } from '../types';
import { trimHistory } from './trimHistory';

const user = (n: number): LlmMessage => ({ role: 'user', content: `m${n}` });

describe('trimHistory', () => {
  it('returns messages unchanged at or under the threshold', () => {
    const messages = [user(1), user(2)];
    expect(trimHistory(messages, 5)).toEqual(messages);
  });

  it('keeps the most recent N over the threshold', () => {
    const messages = Array.from({ length: 25 }, (_, i) => user(i + 1));
    const trimmed = trimHistory(messages, 20);
    expect(trimmed).toHaveLength(20);
    expect(trimmed[0]).toEqual(user(6));
  });

  it('always preserves system messages, excluded from the budget', () => {
    const system: LlmMessage = { role: 'system', content: 'context block' };
    const messages = [system, ...Array.from({ length: 25 }, (_, i) => user(i + 1))];
    const trimmed = trimHistory(messages, 10);
    expect(trimmed[0]).toEqual(system);
    expect(trimmed).toHaveLength(10);
    expect(trimmed[trimmed.length - 1]).toEqual(user(25));
  });

  it('defaults to a 20-message window', () => {
    const messages = Array.from({ length: 30 }, (_, i) => user(i + 1));
    expect(trimHistory(messages)).toHaveLength(20);
  });
});
