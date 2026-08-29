import { ValidationError } from '../../../shared/errors/ValidationError';

/**
 * Product rules for social posts and comments. Kept free of Prisma / HTTP so
 * the use-cases can enforce them against any adapter.
 */

export const MAX_CAPTION_LENGTH = 280;
export const MAX_COMMENT_LENGTH = 500;
export const MIN_FEED_LIMIT = 1;
export const MAX_FEED_LIMIT = 50;
export const DEFAULT_FEED_LIMIT = 20;

/** Calories + macro totals for the shared meal, when the recognised result is available. */
export interface NutritionSummary {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** The exact JSON shape the mobile client reads (`SocialPost.fromJson`). */
export interface SocialPostView {
  id: string;
  authorName: string;
  authorHue: number;
  /**
   * Short-lived signed GET URL for the meal photo, or `null` while the photo
   * is still being processed / no longer in storage. The client shows a
   * placeholder in that case and picks it up on the next feed refresh.
   */
  photoUrl: string | null;
  /** The R2 meal-photo id and its owner — lets the client save this meal with
   *  a photo reference that can be re-signed later (never expires). */
  mealPhotoId: string;
  photoOwnerId: string;
  caption: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
  edited: boolean;
  /** Meal nutrition (from the linked photo recognition), or null if unavailable. */
  nutrition: NutritionSummary | null;
}

/** The exact JSON shape the mobile client reads (`SocialComment.fromJson`). */
export interface SocialCommentView {
  id: string;
  postId: string;
  authorName: string;
  authorHue: number;
  text: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  parentId: string | null;
}

/** A single feed page. Mobile currently reads `items` and ignores `nextCursor`. */
export interface FeedPage {
  items: SocialPostView[];
  nextCursor: string | null;
}

/**
 * Author display name, with a friendly fallback. A DB `User` created via plain
 * email sign-up has no name/username, so we fall back to the email local-part
 * (the same `fallbackHandle` convention the `me` module uses), then "Someone".
 */
export function resolveAuthorName(user: {
  name: string | null;
  username: string | null;
  email?: string | null;
}): string {
  const handle = user.email?.split('@')[0]?.trim();
  return user.name?.trim() || user.username?.trim() || handle || 'Someone';
}

/**
 * A stable 0..360 hue derived from a user id, so every client draws the same
 * avatar gradient for a person without a second lookup. FNV-1a over the id.
 */
export function deriveAuthorHue(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

export function normalizeCaption(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  const trimmed = value.replace(/\s+$/u, '');
  if (trimmed.length > MAX_CAPTION_LENGTH) {
    throw new ValidationError('CAPTION_TOO_LONG', `Caption must be at most ${MAX_CAPTION_LENGTH} characters`);
  }
  return trimmed;
}

export function normalizeCommentText(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    throw new ValidationError('COMMENT_EMPTY', 'A comment cannot be empty');
  }
  if (value.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError('COMMENT_TOO_LONG', `A comment must be at most ${MAX_COMMENT_LENGTH} characters`);
  }
  return value;
}

export function resolveFeedLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_FEED_LIMIT;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value < MIN_FEED_LIMIT || value > MAX_FEED_LIMIT) {
    throw new ValidationError('INVALID_LIMIT', `limit must be an integer between ${MIN_FEED_LIMIT} and ${MAX_FEED_LIMIT}`);
  }
  return value;
}
