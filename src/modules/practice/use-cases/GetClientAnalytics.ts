import { createModuleLogger } from '../../../shared/observability/logger';
import type { ClientAccessPolicy } from './ClientAccessPolicy';
import type { AnalyticsPeriod, ClientAnalytics, ClientInsightsService } from './ClientInsightsService';

const logger = createModuleLogger('practice');

/**
 * The detail page's analytics: assigned dietitian only; every shared scope
 * read is audited. Opening it also refreshes the roster's cached insight.
 */
export class GetClientAnalytics {
  constructor(
    private readonly policy: ClientAccessPolicy,
    private readonly insights: ClientInsightsService,
  ) {}

  async execute(actorId: string, clientId: string, period: AnalyticsPeriod, today: Date): Promise<ClientAnalytics> {
    const link = await this.policy.assertAssigned(actorId, clientId);
    const analytics = await this.insights.compute(link, today, period);

    for (const scope of link.consentScopes) {
      if (scope !== 'meal_photos') {
        this.policy.log(actorId, clientId, scope, 'GET /practice/clients/:clientId/analytics');
      }
    }
    this.insights.refresh(link, today).catch((err: unknown) => {
      logger.warn({ err, linkId: link.id }, 'insight refresh failed');
    });
    return analytics;
  }
}
