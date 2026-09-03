const checkRateLimitMock = jest.fn<Promise<void>, [string, number, number]>();
const consumeDailyQuotaMock = jest.fn<Promise<void>, [string, number]>();

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: (key: string, limit: number, window: number) => checkRateLimitMock(key, limit, window),
}));

jest.mock('../../../shared/rateLimiting/dailyQuota', () => ({
  consumeDailyQuota: (key: string, limit: number) => consumeDailyQuotaMock(key, limit),
}));

jest.mock('../../../shared/config/env', () => ({
  env: {
    CHAT_RATE_LIMIT_PER_USER: 20,
    CHAT_RATE_LIMIT_GLOBAL_FREE: 400,
    CHAT_RATE_LIMIT_GLOBAL_PREMIUM: 2000,
    FREE_DAILY_CHAT_LIMIT: 7,
  },
}));

// eslint-disable-next-line import/first
import type { NextFunction, Request, Response } from 'express';
// eslint-disable-next-line import/first
import { chatRateLimiter } from './chatRateLimiter';

function run(overrides: Partial<Request> = {}): Promise<unknown> {
  const req = { auth: { userId: 'user-42' }, ...overrides } as unknown as Request;
  return new Promise((resolve) => {
    chatRateLimiter(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
  });
}

describe('chatRateLimiter', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(undefined);
    consumeDailyQuotaMock.mockReset();
    consumeDailyQuotaMock.mockResolvedValue(undefined);
  });

  it('checks the per-user limit, the free global bucket, and the daily quota for a non-premium user', async () => {
    const err = await run({ isPremium: false });

    expect(err).toBeUndefined();
    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:user:user-42', 20, 60);
    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:free', 400, 60);
    expect(consumeDailyQuotaMock).toHaveBeenCalledWith('chat:user-42', 7);
  });

  it('routes a premium user to the premium global bucket and skips the daily quota', async () => {
    await run({ isPremium: true });

    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:premium', 2000, 60);
    expect(checkRateLimitMock).not.toHaveBeenCalledWith('chat:global:free', expect.anything(), expect.anything());
    expect(consumeDailyQuotaMock).not.toHaveBeenCalled();
  });

  it('treats a request with no resolved entitlement as free', async () => {
    await run();

    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:free', 400, 60);
    expect(consumeDailyQuotaMock).toHaveBeenCalledWith('chat:user-42', 7);
  });

  it('passes a bucket rejection (429) to next()', async () => {
    const rateLimitError = new Error('RATE_LIMIT_EXCEEDED');
    checkRateLimitMock.mockImplementation((key: string) =>
      key === 'chat:global:free' ? Promise.reject(rateLimitError) : Promise.resolve(),
    );

    expect(await run({ isPremium: false })).toBe(rateLimitError);
  });

  it('passes a daily-quota rejection to next()', async () => {
    const quotaError = new Error('FREE_TIER_DAILY_LIMIT');
    consumeDailyQuotaMock.mockRejectedValue(quotaError);

    expect(await run({ isPremium: false })).toBe(quotaError);
  });
});
