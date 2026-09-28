import { BufferedAiUsageRecorder } from './BufferedAiUsageRecorder';

function event(userId: string | null, inputTokens = 10) {
  return { provider: 'openai', feature: 'chatbot', model: 'm', inputTokens, outputTokens: 5, userId, at: new Date('2026-09-29T10:00:00Z') };
}

describe('BufferedAiUsageRecorder', () => {
  it('writes buffered events in one batch on flush', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const recorder = new BufferedAiUsageRecorder({ aiUsageEvent: { createMany } } as never, 60_000);

    recorder.record(event('u1'));
    recorder.record(event(null, 20));
    await recorder.flush();

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ userId: 'u1', inputTokens: 10, feature: 'chatbot' }),
      expect.objectContaining({ userId: null, inputTokens: 20 }),
    ]);
  });

  it('swallows write failures so LLM calls are never affected', async () => {
    const createMany = jest.fn().mockRejectedValue(new Error('db down'));
    const recorder = new BufferedAiUsageRecorder({ aiUsageEvent: { createMany } } as never, 60_000);

    recorder.record(event('u1'));
    await expect(recorder.flush()).resolves.toBeUndefined();
  });

  it('does nothing when the buffer is empty', async () => {
    const createMany = jest.fn();
    const recorder = new BufferedAiUsageRecorder({ aiUsageEvent: { createMany } } as never, 60_000);
    await recorder.flush();
    expect(createMany).not.toHaveBeenCalled();
  });
});
