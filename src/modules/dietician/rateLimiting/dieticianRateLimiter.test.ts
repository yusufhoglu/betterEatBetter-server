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
    DIETICIAN_RATE_LIMIT_PER_USER: 12,
    DIETICIAN_RATE_LIMIT_GLOBAL_FREE: 200,
    DIETICIAN_RATE_LIMIT_GLOBAL_PREMIUM: 1200,
    FREE_DAILY_DIETICIAN_LIMIT: 3,
  },
}));

// eslint-disable-next-line import/first
import type { NextFunction, Request, Response } from 'express';
// eslint-disable-next-line import/first
import { dieticianRateLimiter } from './dieticianRateLimiter';

function run(overrides: Partial<Request> = {}): Promise<unknown> {
  const req = { auth: { userId: 'user-9' }, ...overrides } as unknown as Request;
  return new Promise((resolve) => {
    dieticianRateLimiter(req, {} as Response, ((err?: unknown) => resolve(err)) as NextFunction);
  });
}

describe('dieticianRateLimiter', () => {
  beforeEach(() => {
    checkRateLimitMock.mockReset();
    checkRateLimitMock.mockResolvedValue(undefined);
    consumeDailyQuotaMock.mockReset();
    consumeDailyQuotaMock.mockResolvedValue(undefined);
  });

  it('checks per-user, free global bucket and the daily quota for a non-premium user', async () => {
    const err = await run({ isPremium: false });

    expect(err).toBeUndefined();
    expect(checkRateLimitMock).toHaveBeenCalledWith('dietician:user:user-9', 12, 60);
    expect(checkRateLimitMock).toHaveBeenCalledWith('dietician:global:free', 200, 60);
    expect(consumeDailyQuotaMock).toHaveBeenCalledWith('dietician:user-9', 3);
  });

  it('routes premium to the premium bucket and skips the daily quota', async () => {
    await run({ isPremium: true });

    expect(checkRateLimitMock).toHaveBeenCalledWith('dietician:global:premium', 1200, 60);
    expect(consumeDailyQuotaMock).not.toHaveBeenCalled();
  });

  it('passes a bucket rejection to next()', async () => {
    const rejection = new Error('RATE_LIMIT_EXCEEDED');
    checkRateLimitMock.mockImplementation((key: string) =>
      key === 'dietician:global:free' ? Promise.reject(rejection) : Promise.resolve(),
    );

    expect(await run({ isPremium: false })).toBe(rejection);
  });
});
