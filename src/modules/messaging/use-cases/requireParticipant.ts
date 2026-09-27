import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { Thread, ThreadParticipant } from '../domain/messagingTypes';
import type { ThreadRepositoryPort } from '../ports/ThreadRepositoryPort';

/** Non-participants get 404 — a thread's existence is not leaked. */
export async function requireParticipant(
  repository: ThreadRepositoryPort,
  threadId: string,
  userId: string,
): Promise<{ thread: Thread; participant: ThreadParticipant }> {
  const [thread, participant] = await Promise.all([
    repository.findThread(threadId),
    repository.findParticipant(threadId, userId),
  ]);
  if (!thread || !participant) {
    throw new NotFoundError('THREAD_NOT_FOUND', 'Thread not found');
  }
  return { thread, participant };
}
