import { prisma } from '../../../shared/persistence/db';
import { isManagedClient } from '../../practice/http/practiceWiring';
import { PracticeSponsoredPremiumAdapter } from '../adapters/practice/PracticeSponsoredPremiumAdapter';
import { PrismaSubscriptionRepository } from '../adapters/repository/PrismaSubscriptionRepository';
import { GetSubscriptionEntitlement } from '../use-cases/GetSubscriptionEntitlement';

/**
 * The one way routes build the entitlement check: store subscriptions plus
 * premium sponsored by the user's dietitian. Every premium gate (AI coach,
 * chat and photo quotas, `/me`, `/subscription/entitlement`) goes through it.
 */
export function buildGetSubscriptionEntitlement(): GetSubscriptionEntitlement {
  return new GetSubscriptionEntitlement(
    new PrismaSubscriptionRepository(prisma),
    new PracticeSponsoredPremiumAdapter(isManagedClient),
  );
}
