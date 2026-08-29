import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { prisma } from '../../../shared/persistence/db';
import { PrismaSocialFeedRepository } from '../adapters/repository/PrismaSocialFeedRepository';
import { AddComment } from '../use-cases/AddComment';
import { CreatePost } from '../use-cases/CreatePost';
import { DeletePost } from '../use-cases/DeletePost';
import { GetComments } from '../use-cases/GetComments';
import { GetFeed } from '../use-cases/GetFeed';
import { GetPost } from '../use-cases/GetPost';
import { ToggleCommentLike } from '../use-cases/ToggleCommentLike';
import { TogglePostLike } from '../use-cases/TogglePostLike';
import { UpdatePostCaption } from '../use-cases/UpdatePostCaption';
import { SocialController } from './SocialController';

export function socialRoutes(): Router {
  const router = Router();

  const repository = new PrismaSocialFeedRepository(prisma);
  const controller = new SocialController(
    new GetFeed(repository),
    new GetPost(repository),
    new CreatePost(repository),
    new UpdatePostCaption(repository),
    new DeletePost(repository),
    new TogglePostLike(repository),
    new GetComments(repository),
    new AddComment(repository),
    new ToggleCommentLike(repository),
  );

  router.get('/feed', authMiddleware, controller.handleGetFeed);
  router.post('/posts', authMiddleware, controller.handleCreatePost);
  router.get('/posts/:postId', authMiddleware, controller.handleGetPost);
  router.patch('/posts/:postId', authMiddleware, controller.handleUpdatePost);
  router.delete('/posts/:postId', authMiddleware, controller.handleDeletePost);
  router.post('/posts/:postId/like', authMiddleware, controller.handleTogglePostLike);
  router.get('/posts/:postId/comments', authMiddleware, controller.handleGetComments);
  router.post('/posts/:postId/comments', authMiddleware, controller.handleAddComment);
  router.post('/comments/:commentId/like', authMiddleware, controller.handleToggleCommentLike);

  return router;
}
