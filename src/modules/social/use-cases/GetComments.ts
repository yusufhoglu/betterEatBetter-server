import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { SocialCommentView } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface GetCommentsInput {
  viewerId: string;
  postId: string;
}

/** All comments for a post, oldest-first, replies flat with `parentId`. */
export class GetComments {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: GetCommentsInput): Promise<SocialCommentView[]> {
    const post = await this.repository.getPostById(input.postId, input.viewerId);
    if (!post) {
      throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
    }

    return this.repository.getComments({ postId: input.postId, viewerId: input.viewerId });
  }
}
