import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';
import { Router } from 'express';
import { authMiddleware } from '../auth/authMiddleware';

/**
 * Builds an auth-protected router for the Bull Board dashboard. main.ts
 * mounts this at an internal path — never exposed as a public route.
 */
export function createBullBoardRouter(queues: readonly Queue[]): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/internal/queues');

  // @bull-board/api's bundled bullmq typings lag behind the installed bullmq
  // version (JobProgress union mismatch) — this cast is a type-only boundary,
  // the runtime shape BullMQAdapter expects is unchanged.
  const bullBoardQueues = queues.map(
    (queue) => new BullMQAdapter(queue),
  ) as unknown as Parameters<typeof createBullBoard>[0]['queues'];

  createBullBoard({ queues: bullBoardQueues, serverAdapter });

  const router = Router();
  router.use(authMiddleware);
  router.use(serverAdapter.getRouter());
  return router;
}
