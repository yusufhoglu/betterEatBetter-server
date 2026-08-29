import type { SocialCommentView } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface ToggleCommentLikeInput {
  userId: string;
  commentId: string;
  liked: boolean;
}

/** Idempotent like / unlike on a comment. */
export class ToggleCommentLike {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: ToggleCommentLikeInput): Promise<SocialCommentView> {
    return this.repository.setCommentLike(input);
  }
}
