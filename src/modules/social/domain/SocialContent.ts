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

/**
 * Optional feed narrowing by the shared meal's nutrition and/or when it was
 * posted. Every bound is inclusive. Ranges run against the denormalized
 * `social_posts` columns — a post whose relevant value is NULL is dropped
 * from the result whenever the matching macro bound is set.
 */
export interface FeedFilter {
  minKcal?: number;
  maxKcal?: number;
  minProteinG?: number;
  maxProteinG?: number;
  minCarbsG?: number;
  maxCarbsG?: number;
  minFatG?: number;
  maxFatG?: number;
  /** Posts created at or after this instant. */
  from?: Date;
  /** Posts created at or before this instant. */
  to?: Date;
}

const MACRO_BOUNDS: ReadonlyArray<[keyof FeedFilter, number]> = [
  ['minKcal', 10000],
  ['maxKcal', 10000],
  ['minProteinG', 2000],
  ['maxProteinG', 2000],
  ['minCarbsG', 2000],
  ['maxCarbsG', 2000],
  ['minFatG', 2000],
  ['maxFatG', 2000],
];

function parseMacroBound(raw: unknown, key: string, max: number): number | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new ValidationError('INVALID_FILTER', `${key} must be a number between 0 and ${max}`);
  }
  return Math.round(value);
}

function parseDateBound(raw: unknown, key: string): Date | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new ValidationError('INVALID_FILTER', `${key} must be an ISO-8601 date string`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('INVALID_FILTER', `${key} must be an ISO-8601 date string`);
  }
  return date;
}

/**
 * Build a validated [FeedFilter] from raw query params, or `undefined` when no
 * filter param is present. Throws `INVALID_FILTER` on a malformed value or an
 * inverted range (min greater than max).
 */
export function resolveFeedFilter(query: Record<string, unknown>): FeedFilter | undefined {
  const filter: FeedFilter = {};
  for (const [key, max] of MACRO_BOUNDS) {
    const value = parseMacroBound(query[key], key, max);
    if (value !== undefined) {
      (filter as Record<string, number>)[key] = value;
    }
  }
  const from = parseDateBound(query.from, 'from');
  const to = parseDateBound(query.to, 'to');
  if (from) filter.from = from;
  if (to) filter.to = to;

  const pairs: ReadonlyArray<[keyof FeedFilter, keyof FeedFilter]> = [
    ['minKcal', 'maxKcal'],
    ['minProteinG', 'maxProteinG'],
    ['minCarbsG', 'maxCarbsG'],
    ['minFatG', 'maxFatG'],
  ];
  for (const [lo, hi] of pairs) {
    const a = filter[lo] as number | undefined;
    const b = filter[hi] as number | undefined;
    if (a !== undefined && b !== undefined && a > b) {
      throw new ValidationError('INVALID_FILTER', `${lo} must not exceed ${hi}`);
    }
  }
  if (filter.from && filter.to && filter.from.getTime() > filter.to.getTime()) {
    throw new ValidationError('INVALID_FILTER', 'from must not be after to');
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}
