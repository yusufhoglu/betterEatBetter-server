import { randomUUID } from 'node:crypto';
import { ForbiddenError } from '../../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import type {
  FeedFilter,
  FeedPage,
  NutritionSummary,
  SocialCommentView,
  SocialPostView,
} from '../../domain/SocialContent';
import { deriveAuthorHue } from '../../domain/SocialContent';
import type {
  AddCommentInput,
  CreatePostInput,
  GetFeedInput,
  SetCommentLikeInput,
  SetPostLikeInput,
  SocialFeedRepositoryPort,
  UpdateCaptionInput,
} from '../../ports/SocialFeedRepositoryPort';

interface PostRow extends CreatePostInput {
  id: string;
  edited: boolean;
  seq: number;
  createdAt: Date;
  nutrition: NutritionSummary | null;
}

interface CommentRow {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  parentId: string | null;
  seq: number;
}

function inRange(value: number | null | undefined, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) {
    return true;
  }
  if (value === null || value === undefined) {
    return false;
  }
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function matchesFilter(row: PostRow, filter: FeedFilter | undefined): boolean {
  if (!filter) {
    return true;
  }
  const n = row.nutrition;
  return (
    inRange(n?.calories, filter.minKcal, filter.maxKcal) &&
    inRange(n?.proteinG, filter.minProteinG, filter.maxProteinG) &&
    inRange(n?.carbsG, filter.minCarbsG, filter.maxCarbsG) &&
    inRange(n?.fatG, filter.minFatG, filter.maxFatG) &&
    (!filter.from || row.createdAt.getTime() >= filter.from.getTime()) &&
    (!filter.to || row.createdAt.getTime() <= filter.to.getTime())
  );
}

/** In-memory `SocialFeedRepositoryPort` for use-case tests. `seq` breaks same-tick ties. */
export class InMemorySocialFeedRepository implements SocialFeedRepositoryPort {
  private readonly posts: PostRow[] = [];
  private readonly comments: CommentRow[] = [];
  private readonly postLikes = new Set<string>();
  private readonly commentLikes = new Set<string>();
  private readonly nutritionByPhoto = new Map<string, NutritionSummary>();
  private seq = 0;

  constructor(private readonly names = new Map<string, string>()) {}

  /** Test seam: attach nutrition to a meal photo id (read at `createPost`). */
  setNutrition(mealPhotoId: string, summary: NutritionSummary): this {
    this.nutritionByPhoto.set(mealPhotoId, summary);
    return this;
  }

  /** Test seam: override a post's created-at for date-filter tests. */
  setCreatedAt(postId: string, createdAt: Date): this {
    const row = this.posts.find((p) => p.id === postId);
    if (row) row.createdAt = createdAt;
    return this;
  }

  /** Test seam: mimic the feed sync writing fresh macros onto a shared post. */
  setPostNutrition(postId: string, summary: NutritionSummary | null): this {
    const row = this.posts.find((p) => p.id === postId);
    if (row) row.nutrition = summary;
    return this;
  }

  private countLikes(set: Set<string>, id: string): number {
    let n = 0;
    for (const key of set) if (key.startsWith(`${id}/`)) n += 1;
    return n;
  }

  private postView(row: PostRow, viewerId: string): SocialPostView {
    return {
      id: row.id,
      authorName: this.names.get(row.authorId) ?? `User ${row.authorId.slice(0, 4)}`,
      authorHue: deriveAuthorHue(row.authorId),
      photoUrl: `https://photos.test/${row.authorId}/${row.mealPhotoId}.jpg`,
      mealPhotoId: row.mealPhotoId,
      photoOwnerId: row.authorId,
      caption: row.caption,
      createdAt: row.createdAt.toISOString(),
      likeCount: this.countLikes(this.postLikes, row.id),
      commentCount: this.comments.filter((c) => c.postId === row.id).length,
      likedByMe: this.postLikes.has(`${row.id}/${viewerId}`),
      isMine: row.authorId === viewerId,
      edited: row.edited,
      nutrition: row.nutrition,
    };
  }

  private commentView(row: CommentRow, viewerId: string): SocialCommentView {
    return {
      id: row.id,
      postId: row.postId,
      authorName: this.names.get(row.authorId) ?? `User ${row.authorId.slice(0, 4)}`,
      authorHue: deriveAuthorHue(row.authorId),
      text: row.text,
      createdAt: new Date(row.seq).toISOString(),
      likeCount: this.countLikes(this.commentLikes, row.id),
      likedByMe: this.commentLikes.has(`${row.id}/${viewerId}`),
      isMine: row.authorId === viewerId,
      parentId: row.parentId,
    };
  }

  private requirePost(postId: string): PostRow {
    const row = this.posts.find((p) => p.id === postId);
    if (!row) throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
    return row;
  }

  async getFeed(input: GetFeedInput): Promise<FeedPage> {
    const ordered = [...this.posts]
      .filter((p) => matchesFilter(p, input.filter))
      .sort((a, b) => b.seq - a.seq);
    const start = input.cursor ? ordered.findIndex((p) => p.id === input.cursor) + 1 : 0;
    const slice = ordered.slice(start, start + input.limit);
    return {
      items: slice.map((p) => this.postView(p, input.viewerId)),
      nextCursor: start + input.limit < ordered.length ? (slice.at(-1)?.id ?? null) : null,
    };
  }

  async getPostById(postId: string, viewerId: string): Promise<SocialPostView | null> {
    const row = this.posts.find((p) => p.id === postId);
    return row ? this.postView(row, viewerId) : null;
  }

  async createPost(input: CreatePostInput): Promise<SocialPostView> {
    if (this.posts.some((p) => p.authorId === input.authorId && p.mealPhotoId === input.mealPhotoId)) {
      throw new ForbiddenError('MEAL_PHOTO_ALREADY_SHARED', 'That meal is already on your feed');
    }
    const seq = (this.seq += 1);
    const row: PostRow = {
      ...input,
      id: randomUUID(),
      edited: false,
      seq,
      createdAt: new Date(seq),
      nutrition: this.nutritionByPhoto.get(input.mealPhotoId) ?? null,
    };
    this.posts.push(row);
    return this.postView(row, input.authorId);
  }

  async updatePostCaption(input: UpdateCaptionInput): Promise<SocialPostView> {
    const row = this.requirePost(input.postId);
    if (row.authorId !== input.authorId) {
      throw new ForbiddenError('NOT_POST_AUTHOR', 'You can only modify your own post');
    }
    row.caption = input.caption;
    row.edited = true;
    return this.postView(row, input.authorId);
  }

  async deletePost(input: { postId: string; authorId: string }): Promise<void> {
    const row = this.requirePost(input.postId);
    if (row.authorId !== input.authorId) {
      throw new ForbiddenError('NOT_POST_AUTHOR', 'You can only modify your own post');
    }
    this.posts.splice(this.posts.indexOf(row), 1);
    for (let i = this.comments.length - 1; i >= 0; i -= 1) {
      if (this.comments[i]!.postId === input.postId) this.comments.splice(i, 1);
    }
  }

  async setPostLike(input: SetPostLikeInput): Promise<SocialPostView> {
    const row = this.requirePost(input.postId);
    this.toggle(this.postLikes, `${input.postId}/${input.userId}`, input.liked);
    return this.postView(row, input.userId);
  }

  async getComments(input: { postId: string; viewerId: string }): Promise<SocialCommentView[]> {
    return this.comments
      .filter((c) => c.postId === input.postId)
      .sort((a, b) => a.seq - b.seq)
      .map((c) => this.commentView(c, input.viewerId));
  }

  async addComment(input: AddCommentInput): Promise<SocialCommentView> {
    this.requirePost(input.postId);
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = this.comments.find((c) => c.id === input.parentId && c.postId === input.postId);
      if (!parent) {
        throw new NotFoundError('PARENT_COMMENT_NOT_FOUND', 'The comment being replied to was not found');
      }
      parentId = parent.parentId ?? parent.id;
    }
    const row: CommentRow = {
      id: randomUUID(),
      postId: input.postId,
      authorId: input.authorId,
      text: input.text,
      parentId,
      seq: (this.seq += 1),
    };
    this.comments.push(row);
    return this.commentView(row, input.authorId);
  }

  async setCommentLike(input: SetCommentLikeInput): Promise<SocialCommentView> {
    const row = this.comments.find((c) => c.id === input.commentId);
    if (!row) throw new NotFoundError('COMMENT_NOT_FOUND', 'Comment was not found');
    this.toggle(this.commentLikes, `${input.commentId}/${input.userId}`, input.liked);
    return this.commentView(row, input.userId);
  }

  private toggle(set: Set<string>, key: string, on: boolean): void {
    if (on) set.add(key);
    else set.delete(key);
  }
}
