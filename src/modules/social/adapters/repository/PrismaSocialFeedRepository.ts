import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenError } from '../../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import { createFinalDownloadUrl } from '../../../../shared/storage/presignedUrl';
import type {
  FeedPage,
  NutritionSummary,
  SocialCommentView,
  SocialPostView,
} from '../../domain/SocialContent';
import { deriveAuthorHue, resolveAuthorName } from '../../domain/SocialContent';
import type {
  AddCommentInput,
  CreatePostInput,
  GetFeedInput,
  SetCommentLikeInput,
  SetPostLikeInput,
  SocialFeedRepositoryPort,
  UpdateCaptionInput,
} from '../../ports/SocialFeedRepositoryPort';

function isKnownPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

function postInclude(viewerId: string) {
  return {
    author: { select: { name: true, username: true, email: true } },
    _count: { select: { comments: true, likes: true } },
    likes: { where: { userId: viewerId }, select: { userId: true } },
  } satisfies Prisma.SocialPostInclude;
}

function commentInclude(viewerId: string) {
  return {
    author: { select: { name: true, username: true, email: true } },
    _count: { select: { likes: true } },
    likes: { where: { userId: viewerId }, select: { userId: true } },
  } satisfies Prisma.SocialCommentInclude;
}

type PostRow = Prisma.SocialPostGetPayload<{ include: ReturnType<typeof postInclude> }>;
type CommentRow = Prisma.SocialCommentGetPayload<{ include: ReturnType<typeof commentInclude> }>;

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Extract calorie + macro totals from a `food_entries.resultJson`. Handles both
 * stored shapes: `{ items:[...], macros? }` and the raw `{ estimate:{ items } }`.
 * Returns null when there is nothing usable.
 */
export function parseNutrition(resultJson: unknown): NutritionSummary | null {
  if (!resultJson || typeof resultJson !== 'object') {
    return null;
  }
  const r = resultJson as {
    macros?: {
      totalCalories?: unknown;
      totalProteinGrams?: unknown;
      totalCarbsGrams?: unknown;
      totalFatGrams?: unknown;
    };
    items?: Array<Record<string, unknown>>;
    estimate?: { items?: Array<Record<string, unknown>> };
  };

  if (r.macros && r.macros.totalCalories != null) {
    return {
      calories: Math.round(num(r.macros.totalCalories)),
      proteinG: Math.round(num(r.macros.totalProteinGrams)),
      carbsG: Math.round(num(r.macros.totalCarbsGrams)),
      fatG: Math.round(num(r.macros.totalFatGrams)),
    };
  }

  const items = r.items ?? r.estimate?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const sum = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const it of items) {
    sum.calories += num(it.calories);
    sum.proteinG += num(it.proteinGrams ?? it.proteinG);
    sum.carbsG += num(it.carbsGrams ?? it.carbsG);
    sum.fatG += num(it.fatGrams ?? it.fatG);
  }
  return {
    calories: Math.round(sum.calories),
    proteinG: Math.round(sum.proteinG),
    carbsG: Math.round(sum.carbsG),
    fatG: Math.round(sum.fatG),
  };
}

function toCommentView(row: CommentRow, viewerId: string): SocialCommentView {
  return {
    id: row.id,
    postId: row.postId,
    authorName: resolveAuthorName(row.author),
    authorHue: deriveAuthorHue(row.authorId),
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    isMine: row.authorId === viewerId,
    parentId: row.parentId,
  };
}

export class PrismaSocialFeedRepository implements SocialFeedRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  private async toPostView(
    row: PostRow,
    viewerId: string,
    nutrition: NutritionSummary | null,
  ): Promise<SocialPostView> {
    return {
      id: row.id,
      authorName: resolveAuthorName(row.author),
      authorHue: deriveAuthorHue(row.authorId),
      // Signed GET URL for users/{authorId}/meals/{mealPhotoId}.jpg — local
      // signing only, no network. 404s for the viewer if the photo is gone.
      photoUrl: await createFinalDownloadUrl(row.authorId, row.mealPhotoId).catch(() => null),
      mealPhotoId: row.mealPhotoId,
      photoOwnerId: row.authorId,
      caption: row.caption,
      createdAt: row.createdAt.toISOString(),
      likeCount: row._count.likes,
      commentCount: row._count.comments,
      likedByMe: row.likes.length > 0,
      isMine: row.authorId === viewerId,
      edited: row.edited,
      nutrition,
    };
  }

  /** Calories + macros for each meal photo, keyed by mealPhotoId (== FoodEntry.id). */
  private async nutritionFor(
    mealPhotoIds: readonly string[],
  ): Promise<Map<string, NutritionSummary>> {
    const out = new Map<string, NutritionSummary>();
    if (mealPhotoIds.length === 0) {
      return out;
    }
    const rows = await this.db.foodEntry.findMany({
      where: { id: { in: [...mealPhotoIds] }, status: 'completed' },
      select: { id: true, resultJson: true },
    });
    for (const row of rows) {
      const parsed = parseNutrition(row.resultJson);
      if (parsed) {
        out.set(row.id, parsed);
      }
    }
    return out;
  }

  private async loadPostView(postId: string, viewerId: string): Promise<SocialPostView> {
    const row = await this.db.socialPost.findUniqueOrThrow({
      where: { id: postId },
      include: postInclude(viewerId),
    });
    const nutrition = (await this.nutritionFor([row.mealPhotoId])).get(row.mealPhotoId) ?? null;
    return this.toPostView(row, viewerId, nutrition);
  }

  async getFeed(input: GetFeedInput): Promise<FeedPage> {
    const rows = await this.db.socialPost.findMany({
      orderBy: { createdAt: 'desc' },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: postInclude(input.viewerId),
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const nutrition = await this.nutritionFor(page.map((r) => r.mealPhotoId));

    return {
      items: await Promise.all(
        page.map((row) =>
          this.toPostView(row, input.viewerId, nutrition.get(row.mealPhotoId) ?? null),
        ),
      ),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getPostById(postId: string, viewerId: string): Promise<SocialPostView | null> {
    const row = await this.db.socialPost.findUnique({
      where: { id: postId },
      include: postInclude(viewerId),
    });
    if (!row) {
      return null;
    }
    const nutrition = (await this.nutritionFor([row.mealPhotoId])).get(row.mealPhotoId) ?? null;
    return this.toPostView(row, viewerId, nutrition);
  }

  async createPost(input: CreatePostInput): Promise<SocialPostView> {
    try {
      const row = await this.db.socialPost.create({
        data: { authorId: input.authorId, mealPhotoId: input.mealPhotoId, caption: input.caption },
        include: postInclude(input.authorId),
      });
      const nutrition =
        (await this.nutritionFor([row.mealPhotoId])).get(row.mealPhotoId) ?? null;
      return this.toPostView(row, input.authorId, nutrition);
    } catch (err) {
      if (isKnownPrismaError(err) && err.code === 'P2002') {
        throw new ForbiddenError('MEAL_PHOTO_ALREADY_SHARED', 'That meal is already on your feed');
      }
      throw err;
    }
  }

  async updatePostCaption(input: UpdateCaptionInput): Promise<SocialPostView> {
    const result = await this.db.socialPost.updateMany({
      where: { id: input.postId, authorId: input.authorId },
      data: { caption: input.caption, edited: true },
    });
    if (result.count === 0) {
      await this.assertOwnership(input.postId, input.authorId);
    }
    return this.loadPostView(input.postId, input.authorId);
  }

  async deletePost(input: { postId: string; authorId: string }): Promise<void> {
    const result = await this.db.socialPost.deleteMany({
      where: { id: input.postId, authorId: input.authorId },
    });
    if (result.count === 0) {
      await this.assertOwnership(input.postId, input.authorId);
    }
  }

  /** Called only after an ownership-scoped write matched nothing. Always throws. */
  private async assertOwnership(postId: string, authorId: string): Promise<never> {
    const existing = await this.db.socialPost.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });
    if (!existing) {
      throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
    }
    if (existing.authorId !== authorId) {
      throw new ForbiddenError('NOT_POST_AUTHOR', 'You can only modify your own post');
    }
    throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
  }

  async setPostLike(input: SetPostLikeInput): Promise<SocialPostView> {
    await this.requirePost(input.postId);
    await this.applyLike(
      input.liked,
      () => this.db.socialPostLike.create({ data: { postId: input.postId, userId: input.userId } }),
      () =>
        this.db.socialPostLike.delete({
          where: { postId_userId: { postId: input.postId, userId: input.userId } },
        }),
    );
    return this.loadPostView(input.postId, input.userId);
  }

  async getComments(input: { postId: string; viewerId: string }): Promise<SocialCommentView[]> {
    const rows = await this.db.socialComment.findMany({
      where: { postId: input.postId },
      orderBy: { createdAt: 'asc' },
      include: commentInclude(input.viewerId),
    });
    return rows.map((row) => toCommentView(row, input.viewerId));
  }

  async addComment(input: AddCommentInput): Promise<SocialCommentView> {
    await this.requirePost(input.postId);

    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.db.socialComment.findFirst({
        where: { id: input.parentId, postId: input.postId },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        throw new NotFoundError('PARENT_COMMENT_NOT_FOUND', 'The comment being replied to was not found');
      }
      parentId = parent.parentId ?? parent.id; // threads are one level deep
    }

    const row = await this.db.socialComment.create({
      data: { postId: input.postId, authorId: input.authorId, text: input.text, parentId },
      include: commentInclude(input.authorId),
    });
    return toCommentView(row, input.authorId);
  }

  async setCommentLike(input: SetCommentLikeInput): Promise<SocialCommentView> {
    const exists = await this.db.socialComment.findUnique({
      where: { id: input.commentId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundError('COMMENT_NOT_FOUND', 'Comment was not found');
    }
    await this.applyLike(
      input.liked,
      () =>
        this.db.socialCommentLike.create({ data: { commentId: input.commentId, userId: input.userId } }),
      () =>
        this.db.socialCommentLike.delete({
          where: { commentId_userId: { commentId: input.commentId, userId: input.userId } },
        }),
    );
    const row = await this.db.socialComment.findUniqueOrThrow({
      where: { id: input.commentId },
      include: commentInclude(input.userId),
    });
    return toCommentView(row, input.userId);
  }

  private async requirePost(postId: string): Promise<void> {
    const post = await this.db.socialPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) {
      throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
    }
  }

  /** Idempotent: swallow the duplicate-insert (P2002) and missing-delete (P2025). */
  private async applyLike(
    liked: boolean,
    add: () => Promise<unknown>,
    remove: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await (liked ? add() : remove());
    } catch (err) {
      const ignorable = liked ? 'P2002' : 'P2025';
      if (!isKnownPrismaError(err) || err.code !== ignorable) {
        throw err;
      }
    }
  }
}
