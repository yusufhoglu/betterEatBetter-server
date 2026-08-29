import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface DeletePostInput {
  authorId: string;
  postId: string;
}

/** Deletes your own post. Comments and likes cascade. Ownership in the adapter. */
export class DeletePost {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: DeletePostInput): Promise<void> {
    return this.repository.deletePost({ postId: input.postId, authorId: input.authorId });
  }
}
