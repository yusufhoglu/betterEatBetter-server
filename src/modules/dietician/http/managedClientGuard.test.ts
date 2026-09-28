import type { Request, Response } from 'express';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { managedClientGuard } from './managedClientGuard';

function run(managed: boolean): Promise<unknown> {
  const guard = managedClientGuard({ isManagedClient: async () => managed });
  return new Promise((resolve) => {
    void guard({ auth: { userId: 'u1' } } as Request, {} as Response, resolve);
  });
}

describe('managedClientGuard', () => {
  it('blocks users with an active dietitian', async () => {
    const err = await run(true);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).toMatchObject({ code: 'AI_COACH_UNAVAILABLE_MANAGED_CLIENT', httpStatus: 403 });
  });

  it('lets everyone else through', async () => {
    expect(await run(false)).toBeUndefined();
  });
});
