import type { FeedPage, SocialCommentView, SocialPostView } from '../domain/SocialContent';

export interface GetFeedInput {
  viewerId: string;
  limit: number;
  cursor?: string;
}

export interface CreatePostInput {
  authorId: string;
  mealPhotoId: string;
  caption: string;
}

export interface UpdateCaptionInput {
  postId: string;
  authorId: string;
  caption: string;
}

export interface SetPostLikeInput {
  postId: string;
  userId: string;
  liked: boolean;
}

export interface AddCommentInput {
  postId: string;
  authorId: string;
  text: string;
  parentId?: string;
}

export interface SetCommentLikeInput {
  commentId: string;
  userId: string;
  liked: boolean;
}

/**
 * The one port the social module talks to. It owns posts, comments and both
 * like tables, and every returned view is already resolved for `viewerId`
 * (`likedByMe` / `isMine` set, author names attached).
 *
 * Ownership is enforced by the adapter: `updatePostCaption` / `deletePost`
 * throw `NotFoundError('POST_NOT_FOUND')` or a `NOT_POST_AUTHOR` error rather
 * than the use-case re-reading the row.
 */
export interface SocialFeedRepositoryPort {
  getFeed(input: GetFeedInput): Promise<FeedPage>;
  getPostById(postId: string, viewerId: string): Promise<SocialPostView | null>;
  createPost(input: CreatePostInput): Promise<SocialPostView>;
  updatePostCaption(input: UpdateCaptionInput): Promise<SocialPostView>;
  deletePost(input: { postId: string; authorId: string }): Promise<void>;
  setPostLike(input: SetPostLikeInput): Promise<SocialPostView>;
  getComments(input: { postId: string; viewerId: string }): Promise<SocialCommentView[]>;
  addComment(input: AddCommentInput): Promise<SocialCommentView>;
  setCommentLike(input: SetCommentLikeInput): Promise<SocialCommentView>;
}
