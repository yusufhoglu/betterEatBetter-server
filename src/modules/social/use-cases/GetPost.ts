import { NotFoundError } from '../../../shared/errors/NotFoundError';
import type { SocialPostView } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface GetPostInput {
  viewerId: string;
  postId: string;
}

export class GetPost {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: GetPostInput): Promise<SocialPostView> {
    const post = await this.repository.getPostById(input.postId, input.viewerId);
    if (!post) {
      throw new NotFoundError('POST_NOT_FOUND', 'Post was not found');
    }
    return post;
  }
}
