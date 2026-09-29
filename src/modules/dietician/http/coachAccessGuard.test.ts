import type { Request, Response } from 'express';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import type { CoachAccess } from '../ports/CoachAccessPort';
import { coachAccessGuard } from './coachAccessGuard';

function run(access: CoachAccess, mode: 'send' | 'read'): Promise<unknown> {
  const guard = coachAccessGuard(
    { checkAccess: async () => access, personaForTurn: async () => ({ kind: 'self' }) },
    mode,
  );
  return new Promise((resolve) => {
    void guard({ auth: { userId: 'u1' } } as Request, {} as Response, resolve);
  });
}

describe('coachAccessGuard', () => {
  it('blocks a dietitian client whose dietitian has not opened the assistant, for reads too', async () => {
    for (const mode of ['send', 'read'] as const) {
      const err = await run({ kind: 'unavailable', reason: 'disabled' }, mode);
      expect(err).toBeInstanceOf(ForbiddenError);
      expect(err).toMatchObject({ code: 'AI_COACH_UNAVAILABLE_MANAGED_CLIENT', httpStatus: 403 });
    }
  });

  it('outside the assistant hours blocks sending but still allows reading history', async () => {
    expect(await run({ kind: 'unavailable', reason: 'off_hours' }, 'send')).toMatchObject({
      code: 'DIETITIAN_AI_OFF_HOURS',
      httpStatus: 403,
    });
    expect(await run({ kind: 'unavailable', reason: 'off_hours' }, 'read')).toBeUndefined();
  });

  it('lets regular users and open assistants through', async () => {
    expect(await run({ kind: 'self' }, 'send')).toBeUndefined();
    expect(await run({ kind: 'assistant' }, 'send')).toBeUndefined();
  });
});
