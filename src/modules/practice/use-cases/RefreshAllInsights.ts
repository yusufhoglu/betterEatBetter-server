import { createModuleLogger } from '../../../shared/observability/logger';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientInsightsService } from './ClientInsightsService';

const logger = createModuleLogger('practice');
const CONCURRENCY = 4;

/** Nightly: recompute every active link's score + alerts. One failure never stops the batch. */
export class RefreshAllInsights {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly insights: ClientInsightsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<{ refreshed: number; failed: number }> {
    const links = await this.repository.listAllActiveLinks();
    const today = this.now();
    let refreshed = 0;
    let failed = 0;
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      await Promise.all(
        links.slice(i, i + CONCURRENCY).map(async (link) => {
          try {
            await this.insights.refresh(link, today);
            refreshed += 1;
          } catch (err) {
            failed += 1;
            logger.error({ err, linkId: link.id }, 'insight refresh failed');
          }
        }),
      );
    }
    return { refreshed, failed };
  }
}
