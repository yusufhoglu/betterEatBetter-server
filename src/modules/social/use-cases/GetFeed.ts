import type { FeedPage } from '../domain/SocialContent';
import { resolveFeedLimit } from '../domain/SocialContent';
import type { SocialFeedRepositoryPort } from '../ports/SocialFeedRepositoryPort';

export interface GetFeedInput {
  viewerId: string;
  limit?: number | string;
  cursor?: string;
}

/** Newest-first page of posts, each resolved for the viewer. */
export class GetFeed {
  constructor(private readonly repository: SocialFeedRepositoryPort) {}

  async execute(input: GetFeedInput): Promise<FeedPage> {
    return this.repository.getFeed({
      viewerId: input.viewerId,
      limit: resolveFeedLimit(input.limit),
      cursor: input.cursor || undefined,
    });
  }
}
