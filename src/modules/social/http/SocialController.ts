import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { resolveFeedFilter } from '../domain/SocialContent';
import type { AddComment } from '../use-cases/AddComment';
import type { CreatePost } from '../use-cases/CreatePost';
import type { DeletePost } from '../use-cases/DeletePost';
import type { GetComments } from '../use-cases/GetComments';
import type { GetFeed } from '../use-cases/GetFeed';
import type { GetPost } from '../use-cases/GetPost';
import type { ToggleCommentLike } from '../use-cases/ToggleCommentLike';
import type { TogglePostLike } from '../use-cases/TogglePostLike';
import type { UpdatePostCaption } from '../use-cases/UpdatePostCaption';

const feedQuerySchema = z
  .object({
    limit: z.string().regex(/^\d+$/).optional(),
    cursor: z.string().min(1).optional(),
    minKcal: z.string().optional(),
    maxKcal: z.string().optional(),
    minProteinG: z.string().optional(),
    maxProteinG: z.string().optional(),
    minCarbsG: z.string().optional(),
    maxCarbsG: z.string().optional(),
    minFatG: z.string().optional(),
    maxFatG: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();

const createPostSchema = z.object({
  mealPhotoId: z.string().uuid(),
  caption: z.string().optional(),
});

const updatePostSchema = z.object({
  caption: z.string(),
});

const likeSchema = z.object({
  liked: z.boolean(),
});

const addCommentSchema = z.object({
  text: z.string(),
  parentId: z.string().min(1).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid request body');
  }
  return parsed.data;
}

/**
 * HTTP surface for the social feed. The feed and comments list endpoints
 * return bare JSON arrays — the mobile client reads them directly.
 */
export class SocialController {
  constructor(
    private readonly getFeed: GetFeed,
    private readonly getPost: GetPost,
    private readonly createPost: CreatePost,
    private readonly updatePostCaption: UpdatePostCaption,
    private readonly deletePost: DeletePost,
    private readonly togglePostLike: TogglePostLike,
    private readonly getComments: GetComments,
    private readonly addComment: AddComment,
    private readonly toggleCommentLike: ToggleCommentLike,
  ) {}

  handleGetFeed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = feedQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new ValidationError('INVALID_QUERY', query.error.issues[0]?.message ?? 'Invalid query');
      }
      const page = await this.getFeed.execute({
        viewerId: req.auth!.userId,
        limit: query.data.limit,
        cursor: query.data.cursor,
        filter: resolveFeedFilter(query.data),
      });
      res.status(200).json(page.items);
    } catch (err) {
      next(err);
    }
  };

  handleGetPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const post = await this.getPost.execute({
        viewerId: req.auth!.userId,
        postId: req.params.postId!,
      });
      res.status(200).json(post);
    } catch (err) {
      next(err);
    }
  };

  handleCreatePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseBody(createPostSchema, req.body);
      const post = await this.createPost.execute({
        authorId: req.auth!.userId,
        mealPhotoId: body.mealPhotoId,
        caption: body.caption,
      });
      res.status(201).json(post);
    } catch (err) {
      next(err);
    }
  };

  handleUpdatePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseBody(updatePostSchema, req.body);
      const post = await this.updatePostCaption.execute({
        authorId: req.auth!.userId,
        postId: req.params.postId!,
        caption: body.caption,
      });
      res.status(200).json(post);
    } catch (err) {
      next(err);
    }
  };

  handleDeletePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.deletePost.execute({
        authorId: req.auth!.userId,
        postId: req.params.postId!,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  handleTogglePostLike = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseBody(likeSchema, req.body);
      const post = await this.togglePostLike.execute({
        userId: req.auth!.userId,
        postId: req.params.postId!,
        liked: body.liked,
      });
      res.status(200).json(post);
    } catch (err) {
      next(err);
    }
  };

  handleGetComments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const comments = await this.getComments.execute({
        viewerId: req.auth!.userId,
        postId: req.params.postId!,
      });
      res.status(200).json(comments);
    } catch (err) {
      next(err);
    }
  };

  handleAddComment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseBody(addCommentSchema, req.body);
      const comment = await this.addComment.execute({
        authorId: req.auth!.userId,
        postId: req.params.postId!,
        text: body.text,
        parentId: body.parentId,
      });
      res.status(201).json(comment);
    } catch (err) {
      next(err);
    }
  };

  handleToggleCommentLike = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parseBody(likeSchema, req.body);
      const comment = await this.toggleCommentLike.execute({
        userId: req.auth!.userId,
        commentId: req.params.commentId!,
        liked: body.liked,
      });
      res.status(200).json(comment);
    } catch (err) {
      next(err);
    }
  };
}
