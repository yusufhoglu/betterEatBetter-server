import type { SocialPostView } from '../domain/SocialContent';
import { normalizeCaption } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface UpdatePostCaptionInput {
  authorId: string;
  postId: string;
  caption: unknown;
}

/**
 * Edits your own post's note. Ownership (404 `POST_NOT_FOUND` vs 403
 * `NOT_POST_AUTHOR`) is enforced by the adapter — the use-case never re-reads.
 */
export class UpdatePostCaption {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: UpdatePostCaptionInput): Promise<SocialPostView> {
    return this.repository.updatePostCaption({
      postId: input.postId,
      authorId: input.authorId,
      caption: normalizeCaption(input.caption),
    });
  }
}
