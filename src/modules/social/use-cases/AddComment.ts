import type { SocialCommentView } from '../domain/SocialContent';
import { normalizeCommentText } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface AddCommentInput {
  authorId: string;
  postId: string;
  text: unknown;
  parentId?: string;
}

/**
 * Adds a comment or a one-level reply. A reply to a reply is re-parented to the
 * top-level comment by the adapter. `POST_NOT_FOUND` / `PARENT_COMMENT_NOT_FOUND`
 * come from the adapter.
 */
export class AddComment {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: AddCommentInput): Promise<SocialCommentView> {
    return this.repository.addComment({
      postId: input.postId,
      authorId: input.authorId,
      text: normalizeCommentText(input.text),
      parentId: input.parentId || undefined,
    });
  }
}
