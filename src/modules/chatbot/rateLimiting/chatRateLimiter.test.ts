const checkRateLimitMock = jest.fn<Promise<void>, [string, number, number]>();

jest.mock('../../../shared/rateLimiting/rateLimiter', () => ({
  checkRateLimit: (key: string, limit: number, window: number) => checkRateLimitMock(key, limit, window),
}));

jest.mock('../../../shared/config/env', () => ({
  env: {
    CHAT_RATE_LIMIT_PER_USER: 20,
    CHAT_RATE_LIMIT_GLOBAL_FREE: 400,
    CHAT_RATE_LIMIT_GLOBAL_PREMIUM: 2000,
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
  });

  it('checks the per-user limit and the free global bucket for a non-premium user', async () => {
    const err = await run({ isPremium: false });

    expect(err).toBeUndefined();
    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:user:user-42', 20, 60);
    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:free', 400, 60);
  });

  it('routes a premium user to the premium global bucket', async () => {
    await run({ isPremium: true });

    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:premium', 2000, 60);
    expect(checkRateLimitMock).not.toHaveBeenCalledWith('chat:global:free', expect.anything(), expect.anything());
  });

  it('treats a request with no resolved entitlement as free', async () => {
    await run();

    expect(checkRateLimitMock).toHaveBeenCalledWith('chat:global:free', 400, 60);
  });

  it('passes a bucket rejection (429) to next()', async () => {
    const rateLimitError = new Error('RATE_LIMIT_EXCEEDED');
    checkRateLimitMock.mockImplementation((key: string) =>
      key === 'chat:global:free' ? Promise.reject(rateLimitError) : Promise.resolve(),
    );

    expect(await run({ isPremium: false })).toBe(rateLimitError);
  });
});
