import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import { PrismaPeopleDirectory } from '../adapters/repository/PrismaPeopleDirectory';
import { BullmqUnreadPushScheduler } from '../jobs/unreadMessagePushJob';
import { CreateChatAttachmentUpload } from '../use-cases/CreateChatAttachmentUpload';
import { ListMessages } from '../use-cases/ListMessages';
import { ListThreads } from '../use-cases/ListThreads';
import { MarkThreadRead } from '../use-cases/MarkThreadRead';
import { SendMessage } from '../use-cases/SendMessage';
import { MessagingController } from './MessagingController';
import { chatAttachmentStorage, realtimeBus, threadRepository } from './messagingWiring';

const SEND_RATE_LIMIT = 30;
const SEND_RATE_LIMIT_WINDOW_SECONDS = 60;

function buildController(): MessagingController {
  const people = new PrismaPeopleDirectory(prisma);
  return new MessagingController(
    new ListThreads(threadRepository, people, chatAttachmentStorage),
    new ListMessages(threadRepository, chatAttachmentStorage),
    new SendMessage(threadRepository, realtimeBus, new BullmqUnreadPushScheduler(), chatAttachmentStorage, (userId) =>
      checkRateLimit(`chat-message:${userId}`, SEND_RATE_LIMIT, SEND_RATE_LIMIT_WINDOW_SECONDS),
    ),
    new MarkThreadRead(threadRepository, realtimeBus),
    new CreateChatAttachmentUpload(threadRepository, chatAttachmentStorage),
    (userId, listener) => realtimeBus.subscribe(userId, listener),
  );
}

/** Mounted at /threads. */
export function messagingRoutes(): Router {
  const router = Router();
  const controller = buildController();

  router.get('/', authMiddleware, controller.handleListThreads);
  router.get('/:threadId/messages', authMiddleware, controller.handleListMessages);
  router.post('/:threadId/messages', authMiddleware, controller.handleSendMessage);
  router.post('/:threadId/read', authMiddleware, controller.handleMarkRead);
  router.post('/:threadId/attachments', authMiddleware, controller.handleCreateAttachmentUpload);

  return router;
}

/** Mounted at /realtime. */
export function realtimeRoutes(): Router {
  const router = Router();
  const controller = buildController();

  router.get('/stream', authMiddleware, controller.handleStream);

  return router;
}
