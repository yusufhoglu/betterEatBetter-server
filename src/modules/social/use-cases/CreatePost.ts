import type { SocialPostView } from '../domain/SocialContent';
import { normalizeCaption } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface CreatePostInput {
  authorId: string;
  mealPhotoId: string;
  caption?: unknown;
}

/**
 * Shares one of the author's already-logged meal photos to the feed.
 *
 * We don't pre-check that the photo exists: the read side builds the image URL
 * as `users/{authorId}/meals/{mealPhotoId}.jpg`, so a bad id can only ever
 * produce the author's own broken image — never leak someone else's photo.
 */
export class CreatePost {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: CreatePostInput): Promise<SocialPostView> {
    return this.repository.createPost({
      authorId: input.authorId,
      mealPhotoId: input.mealPhotoId,
      caption: normalizeCaption(input.caption),
    });
  }
}
