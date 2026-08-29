import type { SocialPostView } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface TogglePostLikeInput {
  userId: string;
  postId: string;
  liked: boolean;
}

/** Idempotent like / unlike. Returns the post with reconciled counts. */
export class TogglePostLike {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: TogglePostLikeInput): Promise<SocialPostView> {
    return this.repository.setPostLike(input);
  }
}
